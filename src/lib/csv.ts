import { Linking, Share } from 'react-native';

export type CsvTemplateType = 'labs' | 'praktikan' | 'asprak';

export interface CsvReviewRow {
  id: string;
  accepted: boolean;
  values: Record<string, string>;
  errors: Record<string, string>;
}

export const CSV_COLUMNS: Record<CsvTemplateType, readonly string[]> = {
  labs: [
    'nama',
    'gedung',
    'deskripsi',
    'latitude',
    'longitude',
    'radiusMeter',
    'gracePeriodMinutes',
    'fineAmount',
  ],
  praktikan: ['email', 'nim', 'nama'],
  asprak: ['email', 'kode', 'nama'],
};

const TEMPLATE_EXAMPLES: Record<CsvTemplateType, string> = {
  labs: [
    'nama,gedung,deskripsi,latitude,longitude,radiusMeter,gracePeriodMinutes,fineAmount',
    'Lab Mobile 1,Gedung Informatika Lt. 2,Lab pemrograman perangkat bergerak,-7.051234,110.440123,100,15,10000',
  ].join('\n'),
  praktikan: [
    'email,nim,nama',
    'budi.praktikan@example.com,24060124120001,Budi Santoso',
  ].join('\n'),
  asprak: [
    'email,kode,nama',
    'raka.asprak@example.com,ASP-01,Raka Pratama',
  ].join('\n'),
};

const DEMO_SAMPLES: Record<CsvTemplateType, string> = {
  labs: [
    'nama,gedung,deskripsi,latitude,longitude,radiusMeter,gracePeriodMinutes,fineAmount',
    'Lab Mobile 1,Gedung Informatika Lt. 2,Lab Android & iOS,-7.051234,110.440123,100,15,10000',
    'Lab Jaringan 2,Gedung Informatika Lt. 3,,-7.051500,110.440400,120,10,15000',
    'Lab Basis Data,,Ruang perlu dilengkapi,-7.051800,110.440700,80,15,10000',
  ].join('\n'),
  praktikan: [
    'email,nim,nama',
    'praktikan1@example.com,24060124120001,Praktikan Satu',
    'praktikan2@example.com,,Praktikan Dua',
  ].join('\n'),
  asprak: [
    'email,kode,nama',
    'asprak1@example.com,ASP-01,Asprak Satu',
    'asprak2@example.com,,Asprak Dua',
  ].join('\n'),
};

export function getCsvTemplate(type: CsvTemplateType): string {
  return TEMPLATE_EXAMPLES[type];
}

export function getCsvDemoSample(type: CsvTemplateType): string {
  return DEMO_SAMPLES[type];
}

export function getTemplateDownloadUrl(type: CsvTemplateType): string | null {
  const base = process.env.EXPO_PUBLIC_PAYMENT_API_URL?.trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/api/templates?type=${type}`;
}

/** Mengunduh template CSV via URL backend jika tersedia, dengan fallback Share teks CSV bawaan RN. */
export async function downloadOrShareCsvTemplate(type: CsvTemplateType): Promise<'url' | 'shared'> {
  const url = getTemplateDownloadUrl(type);
  if (url) {
    try {
      await Linking.openURL(url);
      return 'url';
    } catch {
      // Fallback ke Share jika perangkat gagal membuka URL browser.
    }
  }
  await Share.share({
    title: `template-${type}.csv`,
    message: getCsvTemplate(type),
  });
  return 'shared';
}

function splitCsvLine(line: string): string[] {
  const sep = line.includes(',') ? ',' : line.includes(';') ? ';' : ',';
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function validateNumberRange(raw: string, min: number, max: number, label: string): string | null {
  const num = Number(raw.trim().replace(',', '.'));
  if (!raw.trim() || !Number.isFinite(num)) return `${label} wajib angka.`;
  if (num < min || num > max) return `${label} harus ${min} s.d. ${max}.`;
  return null;
}

/** Validasi murni satu baris CSV untuk umpan balik real-time di ScrollView preview. */
export function validateCsvRow(
  type: CsvTemplateType,
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const req = (key: string, label: string) => {
    if (!(values[key] ?? '').trim()) errors[key] = `${label} wajib diisi.`;
  };

  if (type === 'labs') {
    req('nama', 'Nama lab');
    req('gedung', 'Gedung');
    const checks: [string, string | null][] = [
      ['latitude', validateNumberRange(values.latitude ?? '', -90, 90, 'Latitude')],
      ['longitude', validateNumberRange(values.longitude ?? '', -180, 180, 'Longitude')],
      ['radiusMeter', validateNumberRange(values.radiusMeter ?? '', 10, 1000, 'Radius (m)')],
      ['gracePeriodMinutes', validateNumberRange(values.gracePeriodMinutes ?? '', 0, 180, 'Toleransi (mnt)')],
      ['fineAmount', validateNumberRange(values.fineAmount ?? '', 0, 500000, 'Denda (Rp)')],
    ];
    for (const [key, msg] of checks) {
      if (msg) errors[key] = msg;
    }
    return errors;
  }

  const email = (values.email ?? '').trim();
  if (!email) {
    errors.email = 'Email wajib diisi.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Format email tidak valid.';
  }
  if (type === 'praktikan') req('nim', 'NIM');
  if (type === 'asprak') req('kode', 'Kode asprak');
  req('nama', 'Nama');
  return errors;
}

export function createEmptyCsvRow(type: CsvTemplateType, index: number): CsvReviewRow {
  const values: Record<string, string> = {};
  for (const col of CSV_COLUMNS[type]) {
    if (col === 'radiusMeter') values[col] = '100';
    else if (col === 'gracePeriodMinutes') values[col] = '15';
    else if (col === 'fineAmount') values[col] = '10000';
    else values[col] = '';
  }
  return {
    id: `row-${Date.now()}-${index}`,
    accepted: true,
    values,
    errors: validateCsvRow(type, values),
  };
}

/** Mengubah teks CSV mentah menjadi daftar baris review interaktif. */
export function parseCsvRows(rawCsv: string, type: CsvTemplateType): CsvReviewRow[] {
  const lines = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const expectedCols = CSV_COLUMNS[type];
  const firstCells = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const expectedLower = expectedCols.map((c) => c.toLowerCase());
  const hasHeader = firstCells.some((c) => expectedLower.includes(c));

  const headerIndexMap = new Map<string, number>();
  if (hasHeader) {
    expectedCols.forEach((col) => {
      const idx = firstCells.indexOf(col.toLowerCase());
      if (idx !== -1) headerIndexMap.set(col, idx);
    });
  } else {
    expectedCols.forEach((col, idx) => headerIndexMap.set(col, idx));
  }

  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines.map((line, rowIdx) => {
    const cells = splitCsvLine(line);
    const values: Record<string, string> = {};
    expectedCols.forEach((col) => {
      const idx = headerIndexMap.get(col);
      values[col] = idx !== undefined && idx < cells.length ? cells[idx] : '';
    });
    return {
      id: `csv-${Date.now()}-${rowIdx}`,
      accepted: true,
      values,
      errors: validateCsvRow(type, values),
    };
  });
}
