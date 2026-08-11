import { component$ } from '@builder.io/qwik'
import { QwikCityProvider, RouterOutlet } from '@builder.io/qwik-city'

export default component$(() => (
  <QwikCityProvider>
    <head><meta charset="utf-8" /><title>Qwik compatibility smoke</title></head>
    <body lang="en"><RouterOutlet /></body>
  </QwikCityProvider>
))
