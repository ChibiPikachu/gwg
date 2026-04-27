export default async function handler(req, res) {
  try {
    // Steam will redirect here after login
    const query = req.query;

    console.log("Steam callback hit:", query);

    return res.status(200).send(`
      <html>
        <body>
          <h2>Steam login successful 🎉</h2>
          <p>You can close this window.</p>
        </body>
      </html>
    `);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}