export default function handler(req, res) {
  try {
    const steamId = req.query["openid.claimed_id"]
      ?.toString()
      .split("/")
      .pop();

    return res.status(200).send(`
      <h2>Step 1 OK</h2>
      <p>Steam ID: ${steamId}</p>
    `);
  } catch (err) {
    return res.status(500).send(err.message);
  }
}