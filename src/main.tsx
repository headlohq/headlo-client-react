import ReactDOM from 'react-dom/client'
import { HeadloProvider } from 'headlo-auth'
import { PropServer, PropPreload } from 'headlo-react'
import App from './App'

const authIssuer = import.meta.env.VITE_HEADLO_AUTH_ISSUER     as string
const authKey    = import.meta.env.VITE_HEADLO_AUTH_KEY        as string
const propKey    = import.meta.env.VITE_HEADLO_PUBLISHABLE_KEY as string
const propUrl    = import.meta.env.VITE_HEADLO_API_URL         as string

ReactDOM.createRoot(document.getElementById('root')!).render(
  <HeadloProvider
    publishableKey={authKey}
    issuer={authIssuer}
    signInFallbackRedirectUrl={window.location.pathname}
    signUpFallbackRedirectUrl="/onboarding"
  >
    <PropServer publishableKey={propKey} url={propUrl}>
      <PropPreload
        dist={[{ runtime: 'react', version: '19' }]}
        components={['headlo-auth-button']}
      />
      <App />
    </PropServer>
  </HeadloProvider>
)
