const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Path to JSON file where categories are stored
const dataFilePath = path.join(__dirname, "../data/categories.json");

// Helper to read categories from JSON file
function readCategories() {
  if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, "[]", "utf-8");
  }
  const data = fs.readFileSync(dataFilePath, "utf-8");
  return JSON.parse(data);
}

// Helper to write categories to JSON file
function writeCategories(categories) {
  fs.writeFileSync(dataFilePath, JSON.stringify(categories, null, 2));
}

// Get all categories
router.get('/', (req, res) => {
  try {
    const categories = readCategories();
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get category by ID
router.get('/:id', (req, res) => {
  try {
    const categories = readCategories();
    const category = categories.find(c => c.id === parseInt(req.params.id));
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// Create new category
router.post('/', (req, res) => {
  try {
    const { name, description, image } = req.body;
    if (!name || !description || !image) {
      return res.status(400).json({ error: 'Name, description, and image are required' });
    }

    const categories = readCategories();
    const newCategory = {
      id: Date.now(),
      name,
      description,
      image
    };

    categories.push(newCategory);
    writeCategories(categories);
    res.status(201).json(newCategory);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
router.put('/:id', (req, res) => {
  try {
    const { name, description, image } = req.body;
    const id = parseInt(req.params.id);

    let categories = readCategories();
    const categoryIndex = categories.findIndex(c => c.id === id);

    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Category not found' });
    }

    categories[categoryIndex] = {
      ...categories[categoryIndex],
      name: name || categories[categoryIndex].name,
      description: description || categories[categoryIndex].description,
      image: image || categories[categoryIndex].image
    };

    writeCategories(categories);
    res.json(categories[categoryIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let categories = readCategories();
    const categoryIndex = categories.findIndex(c => c.id === id);

    if (categoryIndex === -1) {
      return res.status(404).json({ error: 'Category not found' });
    }

    categories.splice(categoryIndex, 1);
    writeCategories(categories);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router; 