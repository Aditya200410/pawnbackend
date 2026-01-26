const { exec } = require('child_process');
const path = require('path');

exports.migrateCloudinary = (req, res) => {
    const scriptPath = path.join(__dirname, '../scripts/migrateCloudinary.js');

    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Migration error: ${error}`);
            return res.status(500).json({
                success: false,
                message: 'Migration failed',
                error: error.message,
                stdout,
                stderr
            });
        }

        console.log(`Migration stdout: ${stdout}`);
        res.json({
            success: true,
            message: 'Migration completed successfully!',
            output: stdout
        });
    });
};

exports.revertCloudinary = (req, res) => {
    const scriptPath = path.join(__dirname, '../scripts/revertCloudinary.js');

    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Revert failed',
                error: error.message,
                stdout,
                stderr
            });
        }
        res.json({
            success: true,
            message: 'Revert completed successfully!',
            output: stdout
        });
    });
};
