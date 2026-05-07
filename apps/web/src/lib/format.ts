const dateTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short"
});

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium"
});

const numberFormatter = new Intl.NumberFormat("tr-TR");

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return dateTimeFormatter.format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return dateFormatter.format(new Date(value));
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return numberFormatter.format(value);
}

/**
 * UTF-8 baytları Latin-1/Windows-1252 tek bayt olarak yanlış okunduğunda
 * çoğunlukla C2–C5 ile başlayan ikili diziler oluşur. Normal Türkçe "ü" (U+00FC)
 * tek karakterdir; bozuk iki karakterli örnekler ise C3 BC gibi byte izleri taşır.
 */
function looksLikeUtf8MisreadAsSingleByte(name: string): boolean {
  for (let i = 0; i < name.length; i += 1) {
    const code = name.charCodeAt(i);

    if (code === 0xc3 || code === 0xc4 || code === 0xc5 || code === 0xc2) {
      return true;
    }
  }

  return false;
}

/** UTF-8 dosya adı tek bayt kod sayfalarında yanlış okunduysa düzeltir; sunucu ve istemcide çalışır. */
export function formatProductionPlanFileName(name: string): string {
  if (!name || !looksLikeUtf8MisreadAsSingleByte(name)) {
    return name;
  }

  try {
    const bytes = new Uint8Array(name.length);

    for (let i = 0; i < name.length; i += 1) {
      bytes[i] = name.charCodeAt(i) & 0xff;
    }

    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return name;
  }
}
