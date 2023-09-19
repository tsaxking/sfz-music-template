-- database: /home/tsaxking/tators-dashboard-template/db/main.db
    
    -- Use the ▷ button in the top right corner to run the entire file.
    
    
    
SELECT * FROM MemberInfo
INNER JOIN Accounts ON MemberInfo.username = Accounts.username
WHERE MemberInfo.board = 1