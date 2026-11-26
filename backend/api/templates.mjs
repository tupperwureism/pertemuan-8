const TEMPLATES = {
  labs: [
    'nama,gedung,deskripsi,latitude,longitude,radiusMeter,gracePeriodMinutes,fineAmount',
    'Lab Mobile,Gedung Informatika Lt. 2,Lab praktikum mobile,-7.050000,110.440000,100,15,10000',
  ],
  praktikan: [
    'email,nim,nama',
    'praktikan@example.com,24060124120001,Nama Praktikan',
  ],
  asprak: [
    'email,kode,nama',
    'asprak@example.com,ASP-001,Nama Asprak',
  ],
};

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const type = Array.isArray(req.query?.type) ? req.query.type[0] : req.query?.type;
  const template = TEMPLATES[type];
  if (!template) {
    return res.status(400).json({ error: 'type harus labs, praktikan, atau asprak.' });
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="template-${type}.csv"`);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(`\uFEFF${template.join('\r\n')}\r\n`);
}
