'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clipboard, FolderGit2, LoaderCircle, Plus, Terminal } from 'lucide-react'

function createProjectId() {
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0')
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function copyCommand() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={copyCommand}
      aria-label={copied ? 'Command copied' : 'Copy command'}
      className="command-copy"
    >
      {copied ? <Check size={16} /> : <Clipboard size={16} />}
    </button>
  )
}

function CommandRow({ title, description, command }: { title: string; description: string; command: string }) {
  return (
    <section className="step-row">
      <span className="step-dot" aria-hidden="true" />
      <div className="step-content">
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="command-card">
          <Terminal size={16} aria-hidden="true" className="terminal-icon" />
          <code>{command}</code>
          <CopyButton value={command} />
        </div>
      </div>
    </section>
  )
}

// function ProjectSwitcher({ isNew, setIsNew }: { isNew: boolean; setIsNew: (value: boolean) => void }) {
//   return (
//     <div className="switcher" role="tablist" aria-label="Project type">
//       <button type="button" role="tab" aria-selected={!isNew} onClick={() => setIsNew(false)} className={!isNew ? 'active' : ''}>
//         <FolderGit2 size={18} aria-hidden="true" />
//         Existing project
//       </button>
//       <button type="button" role="tab" aria-selected={isNew} onClick={() => setIsNew(true)} className={isNew ? 'active' : ''}>
//         <Plus size={18} aria-hidden="true" />
//         New project
//       </button>
//     </div>
//   )
// }

function ProjectSetup({ projectName, projectId, onConnect }: { projectName: string; projectId: string; onConnect: () => void }) {
  const initCommand = `node V:/Mavibase/cli/dist/index.js init --id ${projectId}`
  const connectCommand = `V:/Mavibase/cli/dist/index.js connect --id ${projectId}`
  return (
    <div className="steps">
      <CommandRow title="Wire your project" description="Run the following command to wire your project to Mavibase:" command={initCommand} />
      <CommandRow title="Connect your Application" description="Run the following command to connect your application:" command={connectCommand} />
      <button type="button" className="primary-button" onClick={onConnect}>Connect</button>
    </div>
  )
}

function NewProject({ onContinue }: { onContinue: (name: string) => void }) {
  const [projectName, setProjectName] = useState('')
  return (
    <form className="new-project-form" onSubmit={(event) => { event.preventDefault(); if (projectName.trim()) onContinue(projectName.trim()) }}>
      <label>
        <span>Project Name</span>
        <small>A human-readable name for your Mavibase project.</small>
        <input value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="Project Name" required />
      </label>
      <button type="submit" className="primary-button">Continue</button>
      <button type="button" className="secondary-button" onClick={() => onContinue('Untitled project')}>Skip</button>
    </form>
  )
}

export default function Page() {
  const router = useRouter()
  const [isNew, setIsNew] = useState(true)
  const [project, setProject] = useState<{ name: string; id: string } | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  function handleConnect() {
    setIsConnecting(true)
    window.setTimeout(() => router.push('/dashboard'), 5000)
  }

  return (
    <main className="onboarding-shell">
      <div className="onboarding-content">
        <header className="page-header">
          <h1>{isConnecting ? 'Connecting' : project ? 'Wire your project' : 'Create a project'}</h1>
          <div className="progress-track" aria-hidden="true"><span className={isConnecting ? 'connecting-progress' : project ? '' : 'new-progress'} /></div>
        </header>
        {/* {!project && !isConnecting && <ProjectSwitcher isNew={isNew} setIsNew={setIsNew} />} */}
        {isConnecting ? (
          <div className="connecting-state" role="status" aria-live="polite"><LoaderCircle className="spinner" size={34} aria-hidden="true" /><p>Connecting your application...</p></div>
        ) : project ? (
          <ProjectSetup projectName={project.name} projectId={project.id} onConnect={handleConnect} />
        ) : (
          <NewProject onContinue={(name) => setProject({ name, id: createProjectId() })} />
        )}
      </div>
    </main>
  )
}

