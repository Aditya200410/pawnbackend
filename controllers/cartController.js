const Cart = require('../models/Cart');
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const BestSeller = require('../models/bestSeller');
const Loved = require('../models/loved');
const FeaturedProduct = require('../models/FeaturedProduct');

// Helper function to get products from shop.json
const getProducts = () => {
  try {
    const productsPath = path.join(__dirname, '../data/shop.json');
    const productsData = fs.readFileSync(productsPath, 'utf8');
    return JSON.parse(productsData);
  } catch (error) {
    console.error('Error reading shop.json:', error);
    return [];
  }
};

// Helper function to find product across all collections
const findProductById = async (id) => {
  try {
    // Try to find in regular products first
    let product = await Product.findById(id);
    if (product) return product;

    // Try to find in best sellers
    product = await BestSeller.findById(id);
    if (product) return product;

    // Try to find in loved products
    product = await Loved.findById(id);
    if (product) return product;

    // Try to find in featured products
    product = await FeaturedProduct.findById(id);
    if (product) return product;

    return null;
  } catch (err) {
    console.error("Error finding product by ID:", err);
    return null;
  }
};

/**
 * MIGRATION HELPER:
 * If the current userId is a MongoDB ObjectId, check for existing carts 
 * under the user's email or phone and merge them into the current cart.
 */
const migrateAndMergeCart = async (currentCart, userIdString) => {
  const User = require('../models/User');
  const mongoose = require('mongoose');

  if (!mongoose.Types.ObjectId.isValid(userIdString)) return currentCart;

  try {
    const user = await User.findById(userIdString);
    if (!user) return currentCart;

    const conditions = [];
    if (user.email) conditions.push({ userId: user.email.toLowerCase() });
    if (user.phone) conditions.push({ userId: user.phone });

    if (conditions.length === 0) return currentCart;

    // Find any "old" carts using email or phone
    const oldCarts = await Cart.find({ $or: conditions });
    if (!oldCarts || oldCarts.length === 0) return currentCart;

    let targetCart = currentCart;
    if (!targetCart) {
      targetCart = new Cart({ userId: userIdString, items: [] });
    }

    let mergedAny = false;
    for (const oldCart of oldCarts) {
      if (oldCart.userId === userIdString) continue; // Already migrated or same

      console.log(`Merging items from old cart (${oldCart.userId}) into new cart (${userIdString})`);
      
      // Merge items from old cart into target cart
      for (const oldItem of oldCart.items) {
        const existingItemIndex = targetCart.items.findIndex(
          item => item.productId.toString() === oldItem.productId.toString()
        );

        if (existingItemIndex > -1) {
          targetCart.items[existingItemIndex].quantity += oldItem.quantity;
        } else {
          targetCart.items.push(oldItem);
        }
      }
      
      mergedAny = true;
      // Option 1: Delete old cart to avoid double migration
      await Cart.findByIdAndDelete(oldCart._id);
    }

    if (mergedAny || !currentCart) {
      await targetCart.save();
    }
    return targetCart;
  } catch (err) {
    console.error('Migration/Merge logic error:', err);
    return currentCart;
  }
};

// Get user's cart
const getCart = async (req, res) => {
  try {
    const identifier = req.query.email;
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Identifier is required' });
    }

    const userId = identifier.toLowerCase();
    let cart = await Cart.findOne({ userId });

    // Try to migrate or merge if it's a MongoDB ID
    cart = await migrateAndMergeCart(cart, userId);

    if (!cart) {
      // This should theoretically not happen now, but for safety:
      cart = new Cart({ userId, items: [] });
      await cart.save();
    }

    // Fetch latest codAvailable for each item (as before)
    const itemsWithCod = await Promise.all(
      cart.items.map(async (item) => {
        const product = await findProductById(item.productId);
        return {
          ...item.toObject(),
          codAvailable: product ? product.codAvailable : undefined
        };
      })
    );

    res.json({
      success: true,
      items: itemsWithCod,
      totalItems: itemsWithCod.reduce((sum, item) => sum + item.quantity, 0),
      totalPrice: itemsWithCod.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    });
  } catch (error) {
    console.error('Error getting cart:', error);
    res.status(500).json({ success: false, message: 'Failed to get cart' });
  }
};

// Add item to cart
const addToCart = async (req, res) => {
  try {
    const identifier = req.body.email;
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Identifier is required' });
    }
    const userId = identifier.toLowerCase();
    const { productId, quantity = 1 } = req.body;
    
    // Find product in MongoDB
    const product = await findProductById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let cart = await Cart.findOne({ userId });

    // Migration/Merge check
    cart = await migrateAndMergeCart(cart, userId);

    if (!cart) {
      // Create new cart if it doesn't exist
      cart = new Cart({ userId, items: [] });
    }

    // Check if item already exists in cart (as before)
    const existingItemIndex = cart.items.findIndex(item => 
      item.productId.toString() === productId.toString()
    );

    if (existingItemIndex > -1) {
      // Update quantity if item exists
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      // Add new item
      cart.items.push({
        productId: productId.toString(),
        quantity,
        price: product.price,
        name: product.name,
        image: product.image,
        images: product.images || [],
        category: product.category
      });
    }

    await cart.save();
    res.json({
      success: true,
      message: 'Item added to cart',
      items: cart.items,
      totalItems: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      totalPrice: cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ success: false, message: 'Failed to add item to cart' });
  }
};

// Update item quantity
const updateQuantity = async (req, res) => {
  try {
    const email = req.body.email;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const userId = email.toLowerCase();
    const { productId, quantity } = req.body;
    if (quantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }
    
    // Verify product exists across all collections
    const product = await findProductById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    const itemIndex = cart.items.findIndex(item => 
      item.productId.toString() === productId.toString()
    );
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }
    cart.items[itemIndex].quantity = quantity;
    await cart.save();
    res.json({
      success: true,
      message: 'Cart updated',
      items: cart.items,
      totalItems: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      totalPrice: cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    });
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({ success: false, message: 'Failed to update cart' });
  }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const email = req.body.email;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const userId = email.toLowerCase();
    const { productId } = req.params;
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    cart.items = cart.items.filter(item => 
      item.productId.toString() !== productId.toString()
    );
    await cart.save();
    res.json({
      success: true,
      message: 'Item removed from cart',
      items: cart.items,
      totalItems: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      totalPrice: cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ success: false, message: 'Failed to remove item from cart' });
  }
};

// Clear cart
const clearCart = async (req, res) => {
  try {
    const email = req.body.email;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const userId = email.toLowerCase();
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    cart.items = [];
    await cart.save();
    res.json({
      success: true,
      message: 'Cart cleared',
      items: [],
      totalItems: 0,
      totalPrice: 0
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ success: false, message: 'Failed to clear cart' });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateQuantity,
  removeFromCart,
  clearCart
}; 