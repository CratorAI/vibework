// Runs before the UI modules and their styles load, in every window.
try {
  const choice = localStorage.getItem("vibework.theme");
  document.documentElement.classList.toggle("dark", choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches));
} catch { /* Light remains the default when storage is unavailable. */ }
