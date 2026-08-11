import { useCodexConnector } from 'codex-connector/react'

export default function Home() {
  const connector = useCodexConnector({
    serviceId: 'compat-react-router',
    appName: 'React Router compatibility smoke',
  })
  return <h1>State: {connector.status.state}</h1>
}
