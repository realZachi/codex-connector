import { Component } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { resolveBridgeConfig } from 'codex-connector'

@Component({
  selector: 'app-root',
  template: '<h1>Angular compatibility smoke</h1>',
})
class App {
  readonly bridge = resolveBridgeConfig()
}

void bootstrapApplication(App)
