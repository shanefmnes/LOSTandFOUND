<?php
// --- CONFIGURATION ---
$host = "localhost";
$db_name = "project_system";
$username = "root";
$password = "";
$PROJECT_ROOT_DIR = "projectlostnfound"; 

// File Upload Configuration
$BASE_PATH = realpath(__DIR__);
$UPLOAD_DIR = $BASE_PATH . DIRECTORY_SEPARATOR . 'images' . DIRECTORY_SEPARATOR;

if (!is_dir($UPLOAD_DIR)) {
    // Attempt to create the directory if it doesn't exist
    if (!mkdir($UPLOAD_DIR, 0777, true)) {
        error_log("Failed to create image upload directory: " . $UPLOAD_DIR);
    }
}


// --- HEADERS and CORS CHECK ---
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// --- DATABASE CONNECTION ---
function getDbConnection($host, $db_name, $username, $password) {
    try {
        $conn = new PDO("mysql:host=$host;dbname=$db_name;charset=utf8mb4", $username, $password);
        $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $conn;
    } catch (PDOException $exception) {
        error_log("Connection error: " . $exception->getMessage());
        return null;
    }
}

$conn = getDbConnection($host, $db_name, $username, $password);

if (!$conn) {
    http_response_code(503);
    echo json_encode(array("status" => "error", "message" => "Database connection failed. Check your config."));
    exit();
}

// --- HELPER FUNCTION: Notification Insert ---
function insertNotification($conn, $user_id, $title, $body, $type, $item_id = null) {
    try {
        // user_id here is the receiver
        $stmt = $conn->prepare("INSERT INTO notifications (user_id, title, body, type, item_id) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$user_id, $title, $body, $type, $item_id]);
        return true;
    } catch (PDOException $e) {
        error_log("Notification Insert Error: " . $e->getMessage());
        return false;
    }
}
// --- END HELPER FUNCTION ---


// --- INPUT HANDLING ---
$action = null;
$data = null;
$uploaded_file = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $content_type = $_SERVER['CONTENT_TYPE'] ?? '';
    
    if (strpos($content_type, 'multipart/form-data') !== false) {
        // Handle form-data (used for posting item with image)
        $data = (object)$_POST;
        $uploaded_file = $_FILES['item_image'] ?? null;
    } else {
        // Handle raw JSON (used for sign-in, messaging, updates)
        $input = file_get_contents("php://input");
        $data = json_decode($input);
    }
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Handle GET requests (e.g., fetch_items)
    $data = (object)$_GET;
}

// Extract action from data object
$action = $data->action ?? null;

if (!$action) {
    http_response_code(400);
    echo json_encode(array("status" => "error", "message" => "No action specified or invalid request format."));
    exit();
}

switch ($action) {
    
    // --- 1. Authentication Actions ---
    case 'signup':
        if (!empty($data->email) && !empty($data->password) && !empty($data->name)) {
            try {
                $check_stmt = $conn->prepare("SELECT user_id FROM users WHERE email = :email LIMIT 1");
                $check_stmt->bindParam(':email', $data->email);
                $check_stmt->execute();
                if ($check_stmt->rowCount() > 0) {
                    http_response_code(409);
                    echo json_encode(array("status" => "error", "message" => "Email already registered."));
                    exit();
                }
                
                $password_hash = password_hash($data->password, PASSWORD_BCRYPT);
                $clean_name = htmlspecialchars(strip_tags($data->name));

                $stmt = $conn->prepare("INSERT INTO users (full_name, email, password_hash) VALUES (:name, :email, :password)");
                $stmt->bindParam(':name', $clean_name);
                $stmt->bindParam(':email', $data->email);
                $stmt->bindParam(':password', $password_hash);
                
                if ($stmt->execute()) {
                    $user_id = $conn->lastInsertId();
                    echo json_encode(array("status" => "success", "message" => "Registration successful.", "user_id" => $user_id, "full_name" => $clean_name));
                } else {
                    http_response_code(500);
                    echo json_encode(array("status" => "error", "message" => "Registration failed."));
                }
            } catch (PDOException $e) {
                error_log("Signup error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode(array("status" => "error", "message" => "A server error occurred during registration."));
            }
        } else {
            http_response_code(400);
            echo json_encode(array("status" => "error", "message" => "Please fill in all required fields (Name, Email, Password)."));
        }
        break;

    case 'signin':
        if (!empty($data->email) && !empty($data->password)) {
            try {
                $stmt = $conn->prepare("SELECT user_id, full_name, email, password_hash, phone_number FROM users WHERE email = :email LIMIT 1");
                $stmt->bindParam(':email', $data->email);
                $stmt->execute();
                $user = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($user && password_verify($data->password, $user['password_hash'])) {
                    echo json_encode(array(
                        "status" => "success",
                        "message" => "Sign in successful!",
                        "user_id" => $user['user_id'],
                        "full_name" => $user['full_name'],
                        "email" => $user['email'],
                        "phone_number" => $user['phone_number']
                    ));
                } else {
                    http_response_code(401);
                    echo json_encode(array("status" => "error", "message" => "Invalid email or password."));
                }
            } catch (PDOException $e) {
                error_log("Sign-in error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode(array("status" => "error", "message" => "A server error occurred during sign-in."));
            }
        } else {
            http_response_code(400);
            echo json_encode(array("status" => "error", "message" => "Please enter both email and password."));
        }
        break;

    case 'update_profile':
        if (empty($data->user_id) || empty($data->full_name)) {
            http_response_code(400);
            echo json_encode(array("status" => "error", "message" => "Required fields missing for profile update (User ID and Name)."));
            exit();
        }

        $clean_name = htmlspecialchars(strip_tags($data->full_name));
        $phone_number = htmlspecialchars(strip_tags($data->phone_number ?? null));
        $current_password = $data->current_password ?? null;
        $new_password = $data->new_password ?? null;        

        try {
            $sql_set = "full_name = :full_name, phone_number = :phone";
            $params = [
                ':full_name' => $clean_name,
                ':phone' => $phone_number,
                ':user_id' => $data->user_id
            ];
            $message = "Profile updated successfully.";
            
            if (!empty($new_password)) {
                if (empty($current_password)) {
                    http_response_code(400);
                    echo json_encode(array("status" => "error", "message" => "Please enter your current password to set a new one."));
                    exit();
                }
                
                $stmt_fetch = $conn->prepare("SELECT password_hash FROM users WHERE user_id = :user_id LIMIT 1");
                $stmt_fetch->bindParam(':user_id', $data->user_id);
                $stmt_fetch->execute();
                $user = $stmt_fetch->fetch(PDO::FETCH_ASSOC);

                if (!$user || !password_verify($current_password, $user['password_hash'])) {
                    http_response_code(401);
                    echo json_encode(array("status" => "error", "message" => "Incorrect current password. Password not updated."));
                    exit();
                }

                $new_password_hash = password_hash($new_password, PASSWORD_BCRYPT);
                $sql_set .= ", password_hash = :new_password_hash";
                $params[':new_password_hash'] = $new_password_hash;
                $message = "Profile and password updated successfully.";
            }

            $sql = "UPDATE users SET {$sql_set} WHERE user_id = :user_id";
            $stmt = $conn->prepare($sql);
            
            foreach ($params as $key => &$val) {
                $stmt->bindParam($key, $val);
            }
            
            if ($stmt->execute()) {
                echo json_encode(array("status" => "success", "message" => $message, "full_name" => $clean_name, "phone_number" => $phone_number));
            } else {
                http_response_code(500);
                echo json_encode(array("status" => "error", "message" => "Failed to update profile."));
            }
        } catch (PDOException $e) {
            error_log("Profile update error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(array("status" => "error", "message" => "A server error occurred during profile update."));
        }
        break;
    
    // --- 2. Item Actions ---
    case 'post_item':
        $location = $data->location_lost_found ?? $data->location ?? null;
        $date = $data->date_lost_found ?? $data->date ?? null;
        
        if (empty($data->user_id) || empty($data->type) || empty($data->item_name) || empty($data->description) || empty($location) || empty($date) || empty($data->category)) {
            http_response_code(400);
            echo json_encode(array("status" => "error", "message" => "Please fill out all required item details."));
            exit();
        }
        
        $image_url = null;
        // --- IMAGE UPLOAD HANDLER ---
        if ($uploaded_file && $uploaded_file['error'] === UPLOAD_ERR_OK) {
            
            $file_extension = strtolower(pathinfo($uploaded_file['name'], PATHINFO_EXTENSION));
            $new_file_name = uniqid('item_', true) . '.' . $file_extension;
            $target_file = $UPLOAD_DIR . $new_file_name;
            
            if ($uploaded_file['size'] > 5000000) { // Max 5MB
                http_response_code(400);
                echo json_encode(array("status" => "error", "message" => "Sorry, your file is too large (max 5MB)."));
                exit();
            }
            if (!in_array($file_extension, ['jpg', 'jpeg', 'png', 'gif'])) {
                http_response_code(400);
                echo json_encode(array("status" => "error", "message" => "Sorry, only JPG, JPEG, PNG & GIF files are allowed."));
                exit();
            }

            if (move_uploaded_file($uploaded_file["tmp_name"], $target_file)) {
                $image_url = "http://localhost/{$PROJECT_ROOT_DIR}/images/" . $new_file_name;
            } else {
                error_log("File upload failed for item: " . $data->item_name . ". PHP error code: " . $uploaded_file['error']);
            }
        }
        // --- END IMAGE UPLOAD HANDLER ---
        
        try {
            $clean_item_name = htmlspecialchars(strip_tags($data->item_name));
            $clean_description = htmlspecialchars(strip_tags($data->description));

            $sql = "INSERT INTO items (user_id, type, item_name, description, location_lost_found, date_lost_found, category, image_url)
                     VALUES (:user_id, :type, :item_name, :description, :location, :date_time, :category, :image_url)";
            $stmt = $conn->prepare($sql);
            
            $stmt->bindParam(':user_id', $data->user_id);
            $stmt->bindParam(':type', $data->type);
            $stmt->bindParam(':item_name', $clean_item_name);
            $stmt->bindParam(':description', $clean_description);
            $stmt->bindParam(':location', $location);
            $stmt->bindParam(':date_time', $date);
            $stmt->bindParam(':category', $data->category);
            $stmt->bindParam(':image_url', $image_url);
            
            if ($stmt->execute()) {
                // --- NEW POST NOTIFICATION LOGIC START ---
                $new_item_id = $conn->lastInsertId();
                $poster_id = $data->user_id;
                $item_type = $data->type; // 'Lost' or 'Found'
                $item_name = $clean_item_name;
                
                // Get the full_name of the posting user
                $poster_name_stmt = $conn->prepare("SELECT full_name FROM users WHERE user_id = ? LIMIT 1");
                $poster_name_stmt->execute([$poster_id]);
                $poster_name = $poster_name_stmt->fetchColumn();

                // Get ALL user IDs except the one who posted
                $users_to_notify_stmt = $conn->prepare("SELECT user_id FROM users WHERE user_id != ?");
                $users_to_notify_stmt->execute([$poster_id]);
                $users_to_notify = $users_to_notify_stmt->fetchAll(PDO::FETCH_COLUMN);

                $title = "New " . ($item_type === 'Lost' ? 'Lost Item' : 'Found Item') . ": " . $item_name;
                $body = ($poster_name ?? 'A user') . " posted a new item!";
                
                // Loop and insert notification for each user
                foreach ($users_to_notify as $user_id) {
                    insertNotification($conn, $user_id, $title, $body, "new_post", $new_item_id);
                }
                // --- NEW POST NOTIFICATION LOGIC END ---

                http_response_code(201); // 201 Created
                echo json_encode(array("status" => "success", "message" => "Item posted successfully" . ($image_url ? " with image." : "."), "item_id" => $new_item_id));
            } else {
                http_response_code(500);
                echo json_encode(array("status" => "error", "message" => "Failed to post item (Database error)."));
            }
        } catch (PDOException $e) {
            error_log("Post item error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(array("status" => "error", "message" => "A server error occurred while posting the item. Details: " . $e->getMessage()));
        }
        break;
    
    case 'get_item_details':
        if (empty($data->item_id)) {
            http_response_code(400);
            echo json_encode(array("status" => "error", "message" => "Item ID is required."));
            exit();
        }
        
        try {
            $sql = "SELECT i.item_id, i.user_id, i.item_name, i.description, i.type, i.is_claimed, i.status,
                           i.location_lost_found, i.date_lost_found, i.category, i.image_url,
                           u.full_name, u.phone_number
                     FROM items i
                     JOIN users u ON i.user_id = u.user_id
                     WHERE i.item_id = :item_id LIMIT 1";
            $stmt = $conn->prepare($sql);
            $stmt->bindParam(':item_id', $data->item_id);
            $stmt->execute();
            $item = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($item) {
                // Format date for JS input type="date" compatibility
                $item['date_lost_found'] = date('Y-m-d', strtotime($item['date_lost_found']));
                // Format image URL
                if ($item['image_url'] && strpos($item['image_url'], 'http') !== 0) {
                     $item['image_url'] = "http://localhost/{$PROJECT_ROOT_DIR}/images/" . basename($item['image_url']);
                }
                echo json_encode(array("status" => "success", "item" => $item));
            } else {
                http_response_code(404);
                echo json_encode(array("status" => "error", "message" => "Item not found."));
            }
        } catch (PDOException $e) {
            error_log("Get item details error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(array("status" => "error", "message" => "A server error occurred while fetching item details."));
        }
        break;

    case 'update_item':
        if (empty($data->item_id) || empty($data->user_id) || empty($data->item_name) || empty($data->description)) {
            http_response_code(400);
            echo json_encode(array("status" => "error", "message" => "Required item fields missing for update."));
            exit();
        }

        try {
            $check_stmt = $conn->prepare("SELECT user_id, date_lost_found FROM items WHERE item_id = :item_id LIMIT 1");
            $check_stmt->bindParam(':item_id', $data->item_id);
            $check_stmt->execute();
            $item_data = $check_stmt->fetch(PDO::FETCH_ASSOC);

            if (!$item_data || $item_data['user_id'] != $data->user_id) {
                http_response_code(403);
                echo json_encode(array("status" => "error", "message" => "You are not authorized to update this item."));
                exit();
            }

            $clean_item_name = htmlspecialchars(strip_tags($data->item_name));
            $clean_description = htmlspecialchars(strip_tags($data->description));
            $location = $data->location_lost_found ?? null;
            $category = $data->category ?? null;

            // Handle date formatting - combine new date with existing time if present
            $new_date_part = $data->date_lost_found ?? null;
            $old_datetime = $item_data['date_lost_found'];
            
            if ($new_date_part) {
                // Extract time part from old DATETIME (if available)
                $time_part = date('H:i:s', strtotime($old_datetime)); 
                $new_datetime_value = $new_date_part . ' ' . $time_part; 
            } else {
                $new_datetime_value = $old_datetime; // Use existing value
            }

            $sql = "UPDATE items SET
                         type = :type,
                         item_name = :item_name,
                         description = :description,
                         location_lost_found = :location,
                         date_lost_found = :date_time,
                         category = :category
                         WHERE item_id = :item_id AND user_id = :user_id";
            
            $stmt = $conn->prepare($sql);
            
            $stmt->bindParam(':type', $data->type);
            $stmt->bindParam(':item_name', $clean_item_name);
            $stmt->bindParam(':description', $clean_description);
            $stmt->bindParam(':location', $location);
            $stmt->bindParam(':date_time', $new_datetime_value);
            $stmt->bindParam(':category', $category);
            $stmt->bindParam(':item_id', $data->item_id);
            $stmt->bindParam(':user_id', $data->user_id);
            
            if ($stmt->execute()) {
                echo json_encode(array("status" => "success", "message" => "Item updated successfully."));
            } else {
                http_response_code(500);
                echo json_encode(array("status" => "error", "message" => "Failed to update item."));
            }
        } catch (PDOException $e) {
            error_log("Update item error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(array("status" => "error", "message" => "A server error occurred while updating the item."));
        }
        break;

    case 'fetch_items':
        $type = $data->type ?? 'all';
        $query_param = '%' . ($data->query ?? '') . '%';
        // Check if 'my_posts_only' is set to true and get 'user_id'
        $my_posts_only = isset($data->my_posts_only) && $data->my_posts_only === true && isset($data->user_id);
        $user_id = $data->user_id ?? null;

        try {
            $sql = "SELECT i.item_id, i.user_id, i.item_name, i.description, i.type, i.location_lost_found, i.date_lost_found, i.category, i.image_url, i.posted_at, i.is_claimed, i.status, u.full_name
                     FROM items i
                     JOIN users u ON i.user_id = u.user_id
                     WHERE 1=1";
            
            $params = [];
            
            if ($type !== 'all') {
                $sql .= " AND TRIM(i.type) = TRIM(:type)"; 
                $params[':type'] = $type;
            }
            
            // LOGIC: Only show items posted by the current user
            if ($my_posts_only && $user_id) {
                $sql .= " AND i.user_id = :user_id";
                $params[':user_id'] = $user_id;
            }

            if (!empty($data->query)) {
                $sql .= " AND (i.item_name LIKE :query OR i.description LIKE :query OR u.full_name LIKE :query)";
                $params[':query'] = $query_param;
            }
            
            $sql .= " ORDER BY i.posted_at DESC";
            $stmt = $conn->prepare($sql);
            
            foreach ($params as $key => &$val) {
                $stmt->bindParam($key, $val);
            }
            
            $stmt->execute();
            $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Format image URL for frontend display
            foreach ($items as &$item) {
                if ($item['image_url'] && strpos($item['image_url'], 'http') !== 0) {
                     $item['image_url'] = "http://localhost/{$PROJECT_ROOT_DIR}/images/" . basename($item['image_url']);
                }
            }

            echo json_encode(array("status" => "success", "items" => $items));
        } catch (PDOException $e) {
            error_log("Fetch items error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(array("status" => "error", "message" => "Failed to fetch items. Server error: " . $e->getMessage()));
        }
        break;
        
    case 'delete_item':
        if (empty($data->item_id) || empty($data->user_id)) {
            http_response_code(400);
            echo json_encode(array("status" => "error", "message" => "Item ID or User ID missing for deletion."));
            exit();
        }
        try {
            $stmt = $conn->prepare("DELETE FROM items WHERE item_id = :item_id AND user_id = :user_id");
            $stmt->bindParam(':item_id', $data->item_id);
            $stmt->bindParam(':user_id', $data->user_id);
            
            if ($stmt->execute() && $stmt->rowCount() > 0) {
                echo json_encode(array("status" => "success", "message" => "Item deleted successfully."));
            } else {
                http_response_code(403);
                echo json_encode(array("status" => "error", "message" => "Deletion failed. Item not found or you are not the owner."));
            }
        } catch (PDOException $e) {
            error_log("Delete item error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(array("status" => "error", "message" => "A server error occurred during deletion."));
        }
        break;
        
    
    // --- 3. CLAIM ITEM ACTION (WITH NOTIFICATION TRIGGER) ---
    case 'claim_item':
        if (empty($data->user_id) || empty($data->item_id)) {
            http_response_code(400);
            echo json_encode(array("status" => "error", "message" => "Item ID or User ID missing for claiming."));
            exit();
        }

        try {
            
            // 1. GET ITEM DETAILS: Check if user is the owner AND item is NOT yet claimed
            $item_stmt = $conn->prepare("SELECT item_name, user_id FROM items WHERE item_id = :item_id AND user_id = :user_id AND is_claimed = '0' LIMIT 1");
            $item_stmt->execute([
                ':item_id' => $data->item_id, 
                ':user_id' => $data->user_id
            ]);
            $item_data = $item_stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$item_data) {
                // Check if it's already claimed by the owner
                $claimed_stmt = $conn->prepare("SELECT 1 FROM items WHERE item_id = ? AND user_id = ? AND is_claimed = '1' LIMIT 1");
                $claimed_stmt->execute([$data->item_id, $data->user_id]);
                
                if ($claimed_stmt->rowCount() > 0) {
                    http_response_code(400);
                    echo json_encode(array("status" => "error", "message" => "This item has already been marked as claimed/recovered."));
                    exit();
                }

                http_response_code(403); 
                echo json_encode(array("status" => "error", "message" => "You are not authorized to claim this item or it was not found."));
                exit();
            }
            
            // 2. UPDATE ITEM STATUS
            $sql = "UPDATE items 
                    SET is_claimed = '1', 
                        status = 'Recovered',
                        date_claimed = NOW() 
                    WHERE item_id = :item_id 
                    AND user_id = :user_id";
            
            $stmt = $conn->prepare($sql);
            $stmt->bindParam(':item_id', $data->item_id);
            $stmt->bindParam(':user_id', $data->user_id);
            
            if ($stmt->execute() && $stmt->rowCount() > 0) {
                
                // 3. INSERT NOTIFICATION (FOR ALL USERS WHO CHATTED ABOUT IT)
                $owner_id = $data->user_id;
                $item_id = $data->item_id;

                $chatters_stmt = $conn->prepare("
                    SELECT DISTINCT user_id FROM (
                        SELECT sender_id AS user_id FROM messages WHERE item_id = :item_id_1
                        UNION
                        SELECT receiver_id AS user_id FROM messages WHERE item_id = :item_id_2
                        ) AS all_users
                         WHERE user_id != :owner_id_to_exclude
                   
                ");
                $chatters_stmt->execute([
                    ':item_id_1' => $item_id,
                    ':item_id_2' => $item_id,
                    ':owner_id_to_exclude' => $owner_id                   
                ]);
                
                // Get chatters (excluding the owner)
                $chatters = $chatters_stmt->fetchAll(PDO::FETCH_COLUMN);

                foreach ($chatters as $chatter_id) {
                    // Send notification to the other party
                    insertNotification(
                        $conn,
                        $chatter_id,
                        "Item Claimed: " . $item_data['item_name'],
                        "The item you were discussing has been marked as claimed/recovered by the owner.",
                        "claim",
                        $item_id 
                    );
                }
                
                echo json_encode(array("status" => "success", "message" => "Item successfully marked as CLAIMED and Recovered."));
            } else {
                http_response_code(500); 
                echo json_encode(array("status" => "error", "message" => "Failed to update item status. Please try again or item is already claimed."));
            }
        } catch (PDOException $e) {
            error_log("Claim item error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(array("status" => "error", "message" => "A server error occurred while claiming the item. Details: " . $e->getMessage()));
        }
        break;
    

// --- 4. CHAT/MESSAGING ACTIONS ---
    
case 'get_user_conversations':
    $user_id = $data->user_id ?? null;

    if (empty($user_id)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "User ID required."]);
        exit();
    }

    try {
        
        // Subquery to find the LATEST message ID for each unique conversation (item_id + two users)
        $sql_latest = "
            SELECT
                MAX(message_id) AS latest_message_id
            FROM messages
            WHERE sender_id = :user_id_a OR receiver_id = :user_id_b
            GROUP BY item_id, 
                     LEAST(sender_id, receiver_id),
                     GREATEST(sender_id, receiver_id)
        ";
        
        $sql = "
            SELECT 
                m.item_id, 
                i.item_name,
                i.type,
                i.image_url,
                
                CASE 
                    WHEN m.sender_id = :user_id_c THEN m.receiver_id 
                    ELSE m.sender_id 
                END AS other_user_id,
                
                u.full_name AS other_user_name,
                m.message_text AS last_message_text,
                DATE_FORMAT(m.sent_at, '%b %e, %Y %l:%i %p') AS last_message_time,
                
                -- FIXED SUBQUERY: Using alias 'sub_m' to explicitly reference columns to resolve ambiguity
                (SELECT COUNT(*) FROM messages AS sub_m 
                    WHERE sub_m.item_id = m.item_id 
                    AND sub_m.receiver_id = :user_id_e 
                    AND sub_m.is_read = 0 
                    AND sub_m.sender_id = u.user_id
                ) AS unread_count
                
            FROM messages m
            
            INNER JOIN ({$sql_latest}) AS latest_msg ON m.message_id = latest_msg.latest_message_id
            
            JOIN items i ON m.item_id = i.item_id
            JOIN users u ON u.user_id = (
                CASE 
                    WHEN m.sender_id = :user_id_d THEN m.receiver_id 
                    ELSE m.sender_id 
                END
            )
            ORDER BY m.sent_at DESC
        ";
        
        $stmt = $conn->prepare($sql);
        
        
        $stmt->bindParam(':user_id_a', $user_id);
        $stmt->bindParam(':user_id_b', $user_id);
        $stmt->bindParam(':user_id_c', $user_id);
        $stmt->bindParam(':user_id_d', $user_id);
        $stmt->bindParam(':user_id_e', $user_id); 
        
        $stmt->execute();
        $conversations = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Adjust image URL for frontend display
        foreach ($conversations as &$conv) {
             if ($conv['image_url'] && strpos($conv['image_url'], 'http') !== 0) {
                 $conv['image_url'] = "http://localhost/{$PROJECT_ROOT_DIR}/images/" . basename($conv['image_url']);
             }
        }

        echo json_encode(["status" => "success", "conversations" => $conversations]);

    } catch (PDOException $e) {
        error_log("Get Conversations Error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Database error while fetching conversations. Details: " . $e->getMessage()]);
    }
    break;

case 'send_message':
    $sender_id = $data->sender_id ?? null;
    $receiver_id = $data->receiver_id ?? null;
    $item_id = $data->item_id ?? null;
    $message_text = $data->message_text ?? '';

    if (empty($sender_id) || empty($receiver_id) || empty($item_id) || empty($message_text)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Missing message details."]);
        exit();
    }
    
    if ((int)$sender_id === (int)$receiver_id) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Cannot send a message to yourself."]);
        exit();
    }

    try {
        // INSERT message
        $stmt = $conn->prepare("INSERT INTO messages (item_id, sender_id, receiver_id, message_text) VALUES (?, ?, ?, ?)");
        if ($stmt->execute([$item_id, $sender_id, $receiver_id, $message_text])) {
            $new_message_id = $conn->lastInsertId();
            
            // --- NOTIFICATION TRIGGER: Insert notification for the RECEIVER ---
            
            // Fetch item name
            $item_name_stmt = $conn->prepare("SELECT item_name FROM items WHERE item_id = ? LIMIT 1");
            $item_name_stmt->execute([$item_id]);
            $item_name = $item_name_stmt->fetchColumn();

            // Fetch sender name
            $sender_name_stmt = $conn->prepare("SELECT full_name FROM users WHERE user_id = ? LIMIT 1");
            $sender_name_stmt->execute([$sender_id]);
            $sender_name = $sender_name_stmt->fetchColumn() ?? "A user"; 
            
            $title = "New Message about: " . ($item_name ?? "Item ID $item_id");
            $body = $sender_name . ": " . substr($message_text, 0, 50) . (strlen($message_text) > 50 ? '...' : '');
            
            insertNotification($conn, $receiver_id, $title, $body, "message", $item_id);
            // --- END NOTIFICATION TRIGGER ---

            echo json_encode(["status" => "success", "message" => "Message sent.", "message_id" => $new_message_id]);

        } else {
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Failed to send message."]);
        }
    } catch (PDOException $e) {
        error_log("Send Message Error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Database error during message sending. Details: " . $e->getMessage()]);
    }
    break;

case 'fetch_messages':
    $current_user_id = $data->user_id ?? null;
    $other_user_id = $data->receiver_id ?? null;
    $item_id = $data->item_id ?? null;

    if (empty($current_user_id) || empty($other_user_id) || empty($item_id)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Missing chat session details."]);
        exit();
    }

    try {
        // 1. Mark all messages received by the current user as read
        $mark_read_sql = "
            UPDATE messages 
            SET is_read = 1 
            WHERE item_id = :item_id_r AND receiver_id = :user_id_r AND is_read = 0
            AND sender_id = :other_user_id_r
        ";
        $mark_read_stmt = $conn->prepare($mark_read_sql);
        $mark_read_stmt->execute([
            ':item_id_r' => $item_id,
            ':user_id_r' => $current_user_id,
            ':other_user_id_r' => $other_user_id // Only mark messages FROM the other user as read
        ]);
        
        // 2. Retrieve the messages
        $sql = "
            SELECT
                m.*,
                u.full_name AS sender_name,
                DATE_FORMAT(m.sent_at, '%b %e, %Y %l:%i %p') AS formatted_time
            FROM messages m
            JOIN users u ON m.sender_id = u.user_id
            WHERE m.item_id = :item_id
            AND (
                (m.sender_id = :user1 AND m.receiver_id = :user2) OR
                (m.sender_id = :user2_alt AND m.receiver_id = :user1_alt)
            )
            ORDER BY m.sent_at ASC
        ";
        
        $stmt = $conn->prepare($sql);
        $params = [
            ':item_id' => $item_id,
            ':user1' => $current_user_id,
            ':user2' => $other_user_id,
            ':user2_alt' => $other_user_id,
            ':user1_alt' => $current_user_id
        ];
        
        $stmt->execute($params);
        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode(["status" => "success", "messages" => $messages]);

    } catch (PDOException $e) {
        error_log("Fetch Messages Error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Database error while fetching messages. Details: " . $e->getMessage()]);
    }
    break;
    
    
// --- 5. NOTIFICATION ACTIONS ---

case 'get_unread_count':
    $user_id = $data->user_id ?? null;
    if (empty($user_id)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "User ID required."]);
        exit();
    }
    
    try {
        $stmt = $conn->prepare("SELECT COUNT(notification_id) FROM notifications WHERE user_id = :user_id AND is_read = 0");
        $stmt->bindParam(':user_id', $user_id);
        $stmt->execute();
        $count = $stmt->fetchColumn();
        
        echo json_encode(["status" => "success", "unread_count" => (int)$count]);
    } catch (PDOException $e) {
        error_log("Get Unread Count Error: " . $e->getMessage());
        echo json_encode(["status" => "error", "message" => "Failed to fetch unread count."]);
    }
    break;

case 'get_user_notifications':
    $user_id = $data->user_id ?? null;
    if (empty($user_id)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "User ID required."]);
        exit();
    }
    
    try {
        // Retrieve all notifications for the user, newest first. Join with items to get item_name if available.
        $sql = "
            SELECT n.notification_id, n.title, n.body, n.type, n.is_read, n.item_id, 
                     DATE_FORMAT(n.created_at, '%b %e, %Y %l:%i %p') AS created_at,
                     i.item_name
            FROM notifications n
            LEFT JOIN items i ON n.item_id = i.item_id
            WHERE n.user_id = :user_id 
            ORDER BY n.created_at DESC 
            LIMIT 50";
        
        $stmt = $conn->prepare($sql);
        $stmt->bindParam(':user_id', $user_id);
        $stmt->execute();
        $notifications = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        echo json_encode(["status" => "success", "notifications" => $notifications]);
        
    } catch (PDOException $e) {
        error_log("Get Notifications Error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to fetch notifications. Details: " . $e->getMessage()]);
    }
    break;
    
case 'mark_notifications_read':
    $user_id = $data->user_id ?? null;
    if (empty($user_id)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "User ID required."]);
        exit();
    }
    
    try {
        // Update all UNREAD notifications for this user
        $stmt = $conn->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = :user_id AND is_read = 0");
        $stmt->bindParam(':user_id', $user_id);
        $stmt->execute();
        
        echo json_encode(["status" => "success", "message" => "Notifications marked as read."]);
    } catch (PDOException $e) {
        error_log("Mark Read Error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to mark notifications as read."]);
    }
    break;

case 'mark_notifications_viewed':
    $user_id = $data->user_id ?? null;
    if (empty($user_id)) {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "User ID required."]);
        exit();
    }

    try {
        // Update the timestamp of the last view in the users table
        $stmt = $conn->prepare("UPDATE users SET last_notifications_check = CURRENT_TIMESTAMP WHERE user_id = :user_id");
        $stmt->bindParam(':user_id', $user_id);
        $stmt->execute();
        
        echo json_encode(["status" => "success", "message" => "Notification view timestamp updated."]);
    } catch (PDOException $e) {
        error_log("Mark Notifications Viewed Error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to update notification check time."]);
    }
    break;
// --- END NOTIFICATION ACTIONS ---


default:
    http_response_code(400);
    echo json_encode(array("status" => "error", "message" => "Invalid action specified."));
    break;
}

$conn = null;
?>
