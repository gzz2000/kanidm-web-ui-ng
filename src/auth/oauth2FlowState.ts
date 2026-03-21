import type { Oauth2ConsentState } from '../api/oauth2Flow'

type Oauth2FlowMemoryState = {
  consent: Oauth2ConsentState | null
  resumeAttempted: boolean
}

const oauth2FlowMemory: Oauth2FlowMemoryState = {
  consent: null,
  resumeAttempted: false,
}

export function saveOauth2ConsentState(consent: Oauth2ConsentState) {
  oauth2FlowMemory.consent = consent
}

export function loadOauth2ConsentState(): Oauth2ConsentState | null {
  return oauth2FlowMemory.consent
}

export function clearOauth2ConsentState() {
  oauth2FlowMemory.consent = null
}

export function hasOauth2ResumeAttempted() {
  return oauth2FlowMemory.resumeAttempted
}

export function markOauth2ResumeAttempted() {
  oauth2FlowMemory.resumeAttempted = true
}

export function clearOauth2ResumeAttempted() {
  oauth2FlowMemory.resumeAttempted = false
}
