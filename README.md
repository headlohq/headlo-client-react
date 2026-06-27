# headlo-client-react

Example React app showing how to integrate the [headlo-react](https://github.com/headlohq/headlo-react) and [headlo-auth](https://github.com/headlohq/headlo-auth) SDKs.

## What it shows

- Wrapping your app in `<HeadloProvider>` for authentication
- Wrapping with `<PropServer>` to connect your publishable key and API URL
- Using `<PropPreload>` to pre-fetch the component runtime and eliminate first-render flicker
- Rendering `<AuthCard>` and `<PropCard>` in your React tree

## Setup

```bash
npm install
```

Create a `.env` file at the project root:

```
VITE_HEADLO_AUTH_ISSUER=https://auth.headlo.com
VITE_HEADLO_PUBLISHABLE_KEY=pk_live_...
VITE_HEADLO_API_URL=https://api.headlo.com
```

## Dev server

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Related

- [headlo-react](https://github.com/headlohq/headlo-react) — React SDK
- [headlo-auth](https://github.com/headlohq/headlo-auth) — Auth SDK
- [Headlo](https://headlo.com) — affiliate-powered sales channels
