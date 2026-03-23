import { useEffect, useState } from "react";

const THEMES = [
  { value: "ucl", label: "UCL" },
  { value: "uel", label: "UEL" },
  { value: "uecl", label: "UECL" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState("ucl");

  useEffect(() => {
    const current =
      document.documentElement.getAttribute("data-theme") || "ucl";
    setTheme(current);
  }, []);

  function changeTheme(nextTheme: string) {
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("site-theme", nextTheme);
  }

  return (
    <div className="theme-panel inline-flex items-center gap-2 rounded-2xl p-1.5">
      {THEMES.map((item) => {
        const active = theme === item.value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => changeTheme(item.value)}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition sm:text-sm ${
              active
                ? "theme-accent-bg"
                : "theme-button"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}