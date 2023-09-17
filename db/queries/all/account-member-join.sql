-- database: /home/tsaxking/tators-dashboard-template/db/main.db
    
    -- Use the ▷ button in the top right corner to run the entire file.
    
    
    
    SELECT * FROM MemberInfo
INNER JOIN AccountRoles ON MemberInfo.username = AccountRoles.username
INNER JOIN Accounts ON MemberInfo.username = Accounts.username
WHERE AccountRoles.role = 'member' AND AccountRoles.role != 'board'