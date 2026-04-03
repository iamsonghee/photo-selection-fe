This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 이 프로젝트 (photo-selection)

**저장소 루트의 [README.md](../README.md)**에 다음이 정리되어 있습니다.

- 작가 사진 업로드(모바일 압축, 실패 재시도, 백엔드 동시 처리·EXIF)
- 고객 뷰어 이미지 저장 허용/차단 (`NEXT_PUBLIC_BLOCK_VIEWER_IMAGE_DOWNLOAD`)
- 환경 변수 요약

프론트 전용 예시 키는 **`.env.example`**을 보세요.

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

Open [http://localhost:3001](http://localhost:3001) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Troubleshooting

### Hydration mismatch (Recoverable Error)

`Hydration failed because the server rendered HTML didn't match the client` 가 나오면서 `data-wxt-integrated`, `__endic_crx__` 같은 내용이 보이면 **브라우저 확장 프로그램**이 DOM을 수정해서 생기는 경우가 많습니다.

- **엔딕(Endic)** 사전, **WXT** 기반 확장 등을 쓰는 경우 시크릿/프라이빗 창에서 확장 없이 열어 보거나, 해당 확장을 잠시 끄고 새로고침해 보세요.
- 문제가 사라지면 개발/테스트 시 해당 확장을 비활성화하거나 시크릿 창을 사용하면 됩니다.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
