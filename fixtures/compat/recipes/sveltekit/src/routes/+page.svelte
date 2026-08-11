<script lang="ts">
  import { createCodexConnectorStore } from 'codex-connector/svelte'

  const connector = createCodexConnectorStore({
    serviceId: 'compat-sveltekit',
    appName: 'SvelteKit compatibility smoke',
  })
</script>

<h1>State: {$connector.status.state}</h1>
