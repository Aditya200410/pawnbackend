const ProductSubmission = require('../models/ProductSubmission');

// Submit a product
exports.submitProduct = async (req, res) => {
    try {
        const { name, email, phone, productName, productDescription } = req.body;

        let productImage = null;
        if (req.file) {
            productImage = {
                url: req.file.url,
                public_id: req.file.filename
            };
        }

        const submission = new ProductSubmission({
            name,
            email,
            phone,
            productName,
            productDescription,
            productImage
        });

        await submission.save();

        res.status(201).json({
            success: true,
            message: 'Product submitted successfully!',
            submission
        });
    } catch (error) {
        console.error('Submission Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit product'
        });
    }
};

// Get all submissions (Admin)
exports.getAllSubmissions = async (req, res) => {
    try {
        const submissions = await ProductSubmission.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            submissions
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch submissions'
        });
    }
};

// Delete a submission
exports.deleteSubmission = async (req, res) => {
    try {
        await ProductSubmission.findByIdAndDelete(req.params.id);
        res.json({
            success: true,
            message: 'Submission deleted'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete submission'
        });
    }
};
