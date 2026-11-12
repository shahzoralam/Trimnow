import { describe, expect, it } from "vitest";

import { dirFor, isLang, otherLang, pickLocalized } from "@/lib/i18n";

describe("TrimTime languages", () => {
  it("lays out Arabic right-to-left", () => {
    expect(dirFor("ar")).toBe("rtl");
  });

  it("lays out English left-to-right", () => {
    expect(dirFor("en")).toBe("ltr");
  });

  it("only accepts English and Arabic", () => {
    expect(isLang("en")).toBe(true);
    expect(isLang("ar")).toBe(true);
    expect(isLang("fr")).toBe(false);
  });

  it("switcher toggles between English and Arabic", () => {
    expect(otherLang("en")).toBe("ar");
    expect(otherLang("ar")).toBe("en");
  });

  it("shows the Arabic name in Arabic and falls back to English when it is missing", () => {
    expect(pickLocalized({ name_en: "Classic cut", name_ar: "قصة كلاسيكية" }, "name", "ar")).toBe("قصة كلاسيكية");
    expect(pickLocalized({ name_en: "Classic cut", name_ar: "" }, "name", "ar")).toBe("Classic cut");
  });
});
