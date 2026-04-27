export default function handler(req, res) {
  try {
    const user = req.session?.user;

    if (!user) {
      return res.status(200).json(null);
    }

    return res.status(200).json(user);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}