export default function handler(req, res) {
    res.status(200).json({ hello: 'world', at: new Date().toISOString() });
}
