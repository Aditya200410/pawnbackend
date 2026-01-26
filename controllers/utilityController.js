const { exec } = require('child_process');
const path = require('path');

exports.migrateCloudinary = (req, res) => {
    const scriptPath = path.join(__dirname, '../scripts/migrateCloudinary.js');

    // We run it as a separate process to avoid blocking the main server
    // and because the script handles its own DB connection and process exit
    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Migration error: ${error}`);
            return res.status(500).json({
                success: false,
                message: 'Migration failed',
                error: error.message,
                stderr
            });
        }

        console.log(`Migration stdout: ${stdout}`);
        res.json({
            success: true,
            message: 'Migration completed successfully',
            output: stdout
        });
    });
};
