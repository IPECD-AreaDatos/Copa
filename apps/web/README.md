This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Chat Ara Hacienda

El tablero reutiliza el Web Component oficial servido por `ara-web-api`; no
duplica la UI del chat. Para desarrollo local, toda la configuracion del chat
vive en un solo archivo ignorado por Git:

```text
apps/web/.env.local
```

Ese archivo contiene tanto las variables que Copa necesita para cargar el
widget como las variables server-side que `ara-web-api` usa para hablar con
Ara/OpenClaw. No se requieren variables `NEXT_PUBLIC_*`; nada se expone al
navegador salvo lo que el componente recibe explicitamente como props.

Al montar localmente, iniciar Copa normalmente desde `apps/web` y cargar el
mismo `apps/web/.env.local` al iniciar el backend de `ara-web-api`. No completar
variables del chat en dos archivos distintos.

El chat se carga únicamente fuera de `/login` y cuando existe la sesión local
de Copa. Si `ARA_WIDGET_JWT_ENABLED=true`, entrega el `copa_token` mediante el
provider soportado por el widget; el bridge debe estar configurado con el mismo
secreto/algoritmo y con `ARA_WIDGET_JWT_USER_ID_CLAIM=id`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
