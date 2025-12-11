CREATE TABLE `users` (
  `user_id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `full_name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `phone_number` VARCHAR(20) DEFAULT NULL,
  `profile_photo` VARCHAR(255) DEFAULT NULL,
  `contact_info` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `last_notifications_check` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Timestamp when the user last viewed the notification/all items screen'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `items` (
  `item_id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT(11) NOT NULL COMMENT 'The ID of the user who posted the item',
  `type` ENUM('Lost', 'Found') NOT NULL,
  `item_name` VARCHAR(255) NOT NULL,
  `description` TEXT NOT NULL,
  `location_lost_found` VARCHAR(255) DEFAULT NULL,
  `date_lost_found` DATE DEFAULT NULL,
  `category` VARCHAR(100) DEFAULT 'General',
  `image_url` VARCHAR(255) DEFAULT NULL,
  `is_claimed` ENUM('0', '1') NOT NULL DEFAULT '0', 
  `date_claimed` DATETIME NULL,
  `status` ENUM('Active', 'Recovered') DEFAULT 'Active',
  `posted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Indexes for `items`
CREATE INDEX idx_item_type ON items (type);
CREATE INDEX idx_item_category ON items (category);


CREATE TABLE `messages` (
  `message_id` INT AUTO_INCREMENT PRIMARY KEY,
  `item_id` INT NOT NULL COMMENT 'The item being discussed',
  `sender_id` INT NOT NULL COMMENT 'ID of the message sender',
  `receiver_id` INT NOT NULL COMMENT 'ID of the message receiver',
  `message_text` TEXT NOT NULL,
  `sent_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the message was sent',
  `is_read` TINYINT(1) DEFAULT 0 COMMENT '0=Unread, 1=Read',

  FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Index for `messages`
CREATE INDEX idx_messages_thread ON messages (item_id, sender_id, receiver_id, sent_at);


CREATE TABLE `notifications` (
  `notification_id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT(11) NOT NULL COMMENT 'Receiver of the notification',
  `item_id` INT(11) NULL COMMENT 'Related item (optional)',
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `type` ENUM('message', 'claim', 'info', 'new_post') NOT NULL DEFAULT 'info',
  `is_read` TINYINT(1) NOT NULL DEFAULT '0',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
