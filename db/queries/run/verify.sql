-- database: /home/tsaxking/tators-dashboard-template/db/main.db
    
    -- Use the ▷ button in the top right corner to run the entire file.
    
    
    
    UPDATE Accounts
SET verified = 1, verification = null
WHERE username = ?