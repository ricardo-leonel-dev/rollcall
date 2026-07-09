const EXCEL_URL = () => process.env.EXCEL_SERVICE_URL || 'http://excel-service:8002';

export interface Signer { name: string; title: string; label: string; }

export async function exportExcel(
  institutionId: number,
  courseIds: number[],
  academicYearId: number,
  dateFrom: string,
  dateTo: string,
  signers: Signer[] = [],
): Promise<Response> {
  const signersParam = signers.length
    ? '&signers=' + encodeURIComponent(JSON.stringify(signers))
    : '';
  const url = `${EXCEL_URL()}/export/excel?institution_id=${institutionId}&course_ids=${courseIds.join(',')}&academic_year_id=${academicYearId}&date_from=${dateFrom}&date_to=${dateTo}${signersParam}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw Object.assign(new Error(`Error en excel-service: ${text}`), { status: resp.status });
  }
  return resp;
}
