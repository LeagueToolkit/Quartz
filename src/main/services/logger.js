function createLogger({ app, fs, path }) {
  const logDir = path.join(app.getPath('userData'), 'logs');
  const logFile = path.join(logDir, `quartz-${new Date().toISOString().split('T')[0]}.log`);

  function clearOldLogsOnStartup() {
    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
        return;
      }

      const files = fs.readdirSync(logDir);
      let deletedCount = 0;
      for (const file of files) {
        const filePath = path.join(logDir, file);
        try {
          if (file.endsWith('.log')) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (error) {
          console.error(`Failed to delete old log file ${file}:`, error);
        }
      }

      if (deletedCount > 0) {
        console.log(`Cleared ${deletedCount} old log file(s) from logs directory`);
      }
    } catch (error) {
      console.error('Failed to clear old logs:', error);
    }
  }

  function initLogDirectory() {
    try {
      clearOldLogsOnStartup();
    } catch (error) {
      console.error('Failed to initialize log directory:', error);
    }
  }

  function logToFile(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;
    console.log(logMessage.trim());
    try {
      fs.appendFileSync(logFile, logMessage);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  return {
    logToFile,
    initLogDirectory,
    logDir,
    logFile,
  };
}

module.exports = { createLogger };

