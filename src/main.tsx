import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.tsx'
import { UpdateBanner } from './components/pwa/UpdateBanner'
import { initPWA } from './lib/pwa'
import { captureRef } from './lib/referral'

captureRef()
initPWA()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
    <UpdateBanner />
  </StrictMode>,
)
