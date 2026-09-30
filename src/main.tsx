//the entry point

import { StrictMode } from 'react' //dev-mode utility which deliberately invokes your components/effects to surface bugs
import { createRoot } from 'react-dom/client'
//react-dom is the browser renderer, it draws to the DOM(there's react-native)
//createRoot() create a concurrent root that can render asynchronously
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

//getElementById('root) returns HTMLElement | null(TS), ! is TS's non null assertion "I promise it's not null"
