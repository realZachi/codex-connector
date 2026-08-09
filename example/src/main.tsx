import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

const container = document.querySelector('#root')
if (!container) throw new Error('Missing #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
