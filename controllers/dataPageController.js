const DataPage = require('../models/DataPage');

// Get all data pages
dataPageController = async (req, res) => {
  try {
    const pages = await DataPage.find();
    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get data page by type
exports.getDataPageByType = async (req, res) => {
  try {
    const { type } = req.params;
    const page = await DataPage.findOne({ type });
    if (!page) return res.status(404).json({ error: 'Not found' });
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add new data page
exports.addDataPage = async (req, res) => {
  try {
    const { type, heading, content } = req.body;
    const exists = await DataPage.findOne({ type });
    if (exists) return res.status(400).json({ error: 'Type already exists' });
    const page = new DataPage({ type, heading, content });
    await page.save();
    res.status(201).json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update data page by type
exports.updateDataPage = async (req, res) => {
  try {
    const { type } = req.params;
    const { heading, content } = req.body;
    const page = await DataPage.findOneAndUpdate(
      { type },
      { heading, content },
      { new: true }
    );
    if (!page) return res.status(404).json({ error: 'Not found' });
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all data pages
exports.getAllDataPages = dataPageController; 