const EXCEL_URL = () => process.env.EXCEL_SERVICE_URL || 'http://excel-service:8002';

export async function exportExcel(institutionId: number, courseIds: number[], academicYearId: number, dateFrom: string, dateTo: string): Promise<Response> {
  const url = `${EXCEL_URL()}/export/excel?institution_id=${institutionId}&course_ids=${courseIds.join(',')}&academic_year_id=${academicYearId}&date_from=${dateFrom}&date_to=${dateTo}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw Object.assign(new Error(`Error en excel-service: ${text}`), { status: resp.status });
  }
  return resp;
}
