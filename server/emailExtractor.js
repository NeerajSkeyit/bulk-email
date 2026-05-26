import xlsx from 'xlsx';

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function extractEmailsFromWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    raw: false,
    defval: ''
  });

  const emails = new Set();

  for (const row of rows) {
    for (const cell of row) {
      const matches = String(cell).match(EMAIL_REGEX) || [];
      for (const email of matches) {
        emails.add(email.toLowerCase());
      }
    }
  }

  return [...emails];
}
