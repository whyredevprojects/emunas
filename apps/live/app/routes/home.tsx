// Placeholder hello page. W2.4 replaces it with the language redirect target and app shell.
export function meta() {
  return [{ title: "Emunas – Listen" }];
}

export default function Home() {
  return (
    <main>
      <h1>Emunas</h1>
      <p lang="yi" dir="rtl">
        שיעורים
      </p>
      <p>Hello from the Live site skeleton.</p>
    </main>
  );
}
