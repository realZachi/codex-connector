import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server'
import Root from './root'

export default function renderSsr(options: RenderToStreamOptions) {
  return renderToStream(<Root />, options)
}
