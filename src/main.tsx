import React from 'react'
import ReactDOM from 'react-dom/client'
import { HeadloProvider } from 'headlo-auth'
import { PropServer, PropPreload } from 'headlo-react'
import App from './App'

const authIssuer = import.meta.env.VITE_HEADLO_AUTH_ISSUER as string
const authKey    = import.meta.env.VITE_HEADLO_AUTH_KEY    as string
const propKey    = import.meta.env.VITE_HEADLO_PROP_KEY    as string
const propUrl    = import.meta.env.VITE_HEADLO_API_URL     as string

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HeadloProvider publishableKey={authKey} issuer={authIssuer}>
      <PropServer publishableKey={propKey} url={propUrl}>
        {/*
          PropPreload fetches the React runtime bundle + any components
          listed here before they are needed — eliminates first-render flicker.
          Remove components you don't use.
        */}
        <PropPreload
          dist={[{ runtime: 'react', version: '19' }]}
          components={['headlo-auth-button']}
        />
        <App />
      </PropServer>
    </HeadloProvider>
  </React.StrictMode>
)
