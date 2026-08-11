import type { Metadata } from 'next'
import '../../../example/src/styles.css'

export const metadata: Metadata = {
  title: 'Codex Connector demo · Next.js',
  description: 'A real Next.js development example for codex-connector.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
