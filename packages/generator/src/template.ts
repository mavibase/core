export type TemplateRenderer<TData> = (data: TData) => string;
export type TemplateValidator<TData> = (data: TData) => void;

export interface TemplateOptions<TData> {
  name?: string;
  validate?: TemplateValidator<TData>;
}

export interface TemplateErrorDetails {
  template: string;
  reason: string;
  recommendation: string;
}

export class TemplateError extends Error {
  readonly code = "MAVIBASE_TEMPLATE_ERROR";
  readonly details: TemplateErrorDetails;

  constructor(details: TemplateErrorDetails, cause?: unknown) {
    super(`Template "${details.template}" failed: ${details.reason}. ${details.recommendation}`, {
      cause,
    });
    this.name = "TemplateError";
    this.details = details;
  }
}

function normalizeOutput(output: string): string {
  return output.replace(/\r\n?/g, "\n");
}

export class Template<TData> {
  readonly name: string;
  private readonly renderer: TemplateRenderer<TData>;
  private readonly validator: TemplateValidator<TData> | undefined;

  constructor(renderer: TemplateRenderer<TData>, options?: TemplateOptions<TData>) {
    const name = options?.name?.trim() || "anonymous";
    this.name = name;
    this.renderer = renderer;
    this.validator = options?.validate;
  }

  render(data: TData): string {
    try {
      this.validator?.(data);
      const output = this.renderer(data);
      if (typeof output !== "string") {
        throw new TypeError("the renderer must return a string");
      }
      return normalizeOutput(output);
    } catch (error) {
      if (error instanceof TemplateError) {
        throw error;
      }
      throw new TemplateError(
        {
          template: this.name,
          reason: error instanceof Error ? error.message : "template rendering failed",
          recommendation: "Check the template data and renderer implementation",
        },
        error,
      );
    }
  }
}

export function defineTemplate<TData>(
  renderer: TemplateRenderer<TData>,
  options?: TemplateOptions<TData>,
): Template<TData> {
  return new Template(renderer, options);
}

export function renderTemplate<TData>(template: Template<TData>, data: TData): string {
  return template.render(data);
}
