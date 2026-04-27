export default function handler(req, res) {
  return res.status(200).send(`
    <html>
      <body>
        <h2>Callback reached ✅</h2>
        <pre>${JSON.stringify(req.query, null, 2)}</pre>
      </body>
    </html>
  `);
}