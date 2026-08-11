import { createCodexConnector } from 'codex-connector/solid'

export default function App() {
  const connector = createCodexConnector({
    serviceId: 'compat-solid-start',
    appName: 'SolidStart compatibility smoke',
  })
  return <main>State: {connector.status().state}</main>
}
