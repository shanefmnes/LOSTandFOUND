const API_URL = 'http://localhost/projectlostnfound/api.php';
const STORAGE_KEY = 'lostnfound_user';

const app = {
    state: {
        currentView: 'splash',
        user: JSON.parse(localStorage.getItem(STORAGE_KEY)) || null,
        currentItem: null,
        currentChatReceiverId: null,
        currentChatItemId: null,
        chatRefreshInterval: null
    },

    init: function() {
        if (this.state.user) {
            this.showView('dashboard');
            this.fetchItems('all');
            this.checkForUnreadNotifications();
        } else {
            setTimeout(() => {
                this.showView('get-started');
            }, 2000);
        }
        // Setup event listeners
        document.getElementById('signup-form').addEventListener('submit', this.handleSignup.bind(this));
        document.getElementById('signin-form').addEventListener('submit', this.handleSignin.bind(this));
        document.getElementById('profile-form').addEventListener('submit', this.handleProfileUpdate.bind(this));
        document.getElementById('post-item-form').addEventListener('submit', this.handlePostItem.bind(this));
        document.getElementById('search-input').addEventListener('input', this.handleSearch.bind(this));

        const editItemForm = document.getElementById('edit-item-form');
        if (editItemForm) {
            editItemForm.addEventListener('submit', this.handleItemUpdate.bind(this));
        }
        
        // CHAT LOGIC: Setup event listener for Send Message Button
        const sendMessageBtn = document.getElementById('send-message-btn');
        if (sendMessageBtn) {
            sendMessageBtn.addEventListener('click', this.handleSendMessage.bind(this));
        }
        
        // handle Enter key in chat input field
        const chatInput = document.getElementById('chat-message-input');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        }
    },

    showView: function(viewId, skipNavbarUpdate = false) {
    
        if (this.state.chatRefreshInterval) {
            clearInterval(this.state.chatRefreshInterval);
            this.state.chatRefreshInterval = null;
            console.log("Chat refresh stopped.");
        }

        const views = document.querySelectorAll('.view');
        views.forEach(view => {
            view.classList.add('hidden-view');
            view.classList.remove('active-view');
        });

        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.remove('hidden-view');
            targetView.classList.add('active-view');
            this.state.currentView = viewId;
        }

        // handle the Navbar
        const navbar = document.getElementById('navbar');
        if (['dashboard', 'post-item', 'menu', 'profile', 'search', 'item-details', 'chat-view', 'chat-list', 'notifications'].includes(viewId)) {
            navbar.classList.remove('hidden');
            navbar.classList.add('flex');
            
            if (!skipNavbarUpdate) {
                const navTarget = (['profile', 'menu', 'chat-view', 'chat-list', 'notifications'].includes(viewId)) ? 'menu' : (viewId === 'item-details' ? 'dashboard' : viewId);
                this.updateActiveNavTab(navTarget);
            }
        } else {
            navbar.classList.add('hidden');
            navbar.classList.remove('flex');
        }

        if (viewId === 'profile') {
            this.loadUserProfile();
        }
        
        // load chat list 
        if (viewId === 'chat-list') {
            this.fetchConversations();
        }
        
        // --- NOTIFICATION LOGIC ---
        if (viewId === 'notifications') {
            this.loadNotifications(); 
        }
        
        document.getElementById('views-container').scrollTop = 0;
    },
    
    updateActiveNavTab: function(type) {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active-nav-tab', 'text-blue-600');
            tab.classList.add('text-gray-500');
        });
        
        const targetType = (type === 'profile' || type === 'item-details' || type === 'chat-view' || type === 'chat-list' || type === 'notifications') ? 'menu' : type;

        const targetTab = document.querySelector(`.nav-tab[data-type="${targetType}"]`);
        
        if (targetTab) {
            targetTab.classList.add('active-nav-tab', 'text-blue-600');
            targetTab.classList.remove('text-gray-500');
        }
    },


    showMessage: function(message) {
        document.getElementById('message-text').innerText = message;
        document.getElementById('message-box').classList.remove('hidden');
        document.getElementById('message-box').classList.add('flex');
    },

    /** Password Toggle Function */
    togglePasswordVisibility: function(inputId, toggleId) {
        const passwordInput = document.getElementById(inputId);
        const toggleIcon = document.getElementById(toggleId);
        
        if (!passwordInput || !toggleIcon) {
            console.error('Password input or toggle icon not found:', inputId, toggleId);
            return;
        }

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.setAttribute('data-lucide', 'eye');
        } else {
            passwordInput.type = 'password';
            toggleIcon.setAttribute('data-lucide', 'eye-off');
        }

        lucide.createIcons();
        passwordInput.focus();
    },

    // --- Authentication Logic ---

    handleSignup: async function(e) {
        e.preventDefault();
        const form = e.target;
        const data = {
            action: 'signup',
            name: form.elements['name'].value,
            email: form.elements['email'].value,
            password: form.elements['password'].value
        };

        const response = await this.callApi(data);
        if (response.status === 'success') {
            this.state.user = { user_id: response.user_id, full_name: response.full_name, email: data.email };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.user));
            document.getElementById('welcome-message').innerText = `Hello, ${response.full_name}!`;
            this.showView('welcome');
        } else {
            this.showMessage(response.message);
        }
    },

    handleSignin: async function(e) {
        e.preventDefault();
        const form = e.target;
        const data = {
            action: 'signin',
            email: form.elements['email'].value,
            password: form.elements['password'].value
        };

        const response = await this.callApi(data);
        if (response.status === 'success') {
            this.state.user = {
                user_id: response.user_id,
                full_name: response.full_name,
                email: response.email,
                phone_number: response.phone_number
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.user));
            document.getElementById('welcome-message').innerText = `Hello, ${response.full_name}!`;
            this.showView('welcome');
        } else {
            this.showMessage(response.message);
        }
    },

    signOut: function() {
        this.state.user = null;
        localStorage.removeItem(STORAGE_KEY);
        this.showMessage('You have been signed out.');
        this.showView('get-started');
    },

    // --- Profile Logic ---
    loadUserProfile: function() {
        if (!this.state.user) return this.showView('signin');

        document.getElementById('profile-name').innerText = this.state.user.full_name;
        document.getElementById('profile-email').innerText = this.state.user.email;
        document.getElementById('profile-name-edit').value = this.state.user.full_name;
        document.getElementById('profile-initial').innerText = this.state.user.full_name[0].toUpperCase();
        
        document.getElementById('profile-phone').value = this.state.user.phone_number || '';
        
        document.getElementById('profile-password-current').value = '';
        document.getElementById('profile-password-new').value = '';
        
        document.getElementById('profile-password-current').type = 'password';
        document.getElementById('profile-password-new').type = 'password';
        
        document.getElementById('toggle-profile-current-password').setAttribute('data-lucide', 'eye-off');
        document.getElementById('toggle-profile-new-password').setAttribute('data-lucide', 'eye-off');
        lucide.createIcons();
    },

    handleProfileUpdate: async function(e) {
        e.preventDefault();
        if (!this.state.user) return this.showMessage("Error: User not logged in.");

        const form = e.target;
        const newPassword = form.elements['new_password'].value.trim();
        const currentPassword = form.elements['current_password'].value.trim();
        
        const data = {
            action: 'update_profile',
            user_id: this.state.user.user_id,
            full_name: form.elements['full_name'].value.trim(),
            phone_number: form.elements['phone_number'].value.trim(),
            current_password: currentPassword,
            new_password: newPassword
        };
        
        if (newPassword && !currentPassword) {
            return this.showMessage("Please enter your current password to set a new one.");
        }

        const response = await this.callApi(data);
        if (response.status === 'success') {
            this.state.user.full_name = response.full_name;
            this.state.user.phone_number = response.phone_number;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.user));
            
            this.showMessage(response.message);
            this.loadUserProfile();
        } else {
            this.showMessage(response.message);
        }
    },


    // --- Item Logic ---

    showDashboard: function(type, tabElement) {
        if (!this.state.user) return this.showView('signin');

        const titleMap = {
            'all': 'All Items',
            'Lost': 'Lost Items',
            'Found': 'Found Items'
        };

        document.getElementById('dashboard-title').innerText = titleMap[type] || 'Dashboard';
        this.showView('dashboard');
        this.updateActiveNavTab(type);
        this.fetchItems(type);
    },
    
    fetchItems: async function(type = 'all', query = '', targetContainer = 'feed-container') {
        const container = document.getElementById(targetContainer);
        if (!container) return;

        container.innerHTML = `
            <div class="text-center text-gray-500 mt-10">
                <i data-lucide="loader-2" class="w-8 h-8 mx-auto animate-spin mb-2"></i>
                <p>Loading ${type} items...</p>
            </div>
        `;
        lucide.createIcons();

        const data = {
            action: 'fetch_items',
            type: type,
            query: query
        };

        const response = await this.callApi(data);
        if (response.status === 'success') {
            this.renderItems(response.items, container);
        } else {
            container.innerHTML = `<p class="text-center text-red-500 mt-10">Error loading items: ${response.message}</p>`;
        }
    },

    renderItems: function(items, container) {
        container.innerHTML = '';
        if (items.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 mt-10">No items.</p>';
            return;
        }

        items.forEach(item => {
            const isOwner = this.state.user && item.user_id == this.state.user.user_id;
            const typeColor = item.type === 'Lost' ? 'text-red-500' : 'text-green-500';
            const iconType = item.type === 'Lost' ? 'frown' : 'smile';
            
            const imageUrl = item.image_url && item.image_url.startsWith('http')
                               ? item.image_url
                               : 'images/placeholder.png'; 

            const itemHtml = `
                <div class="bg-white p-4 rounded-xl shadow-lg border-l-4 ${item.type === 'Lost' ? 'border-red-500' : 'border-green-500'} mb-4">
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="text-lg font-semibold text-gray-800">${item.item_name}</h3>
                        <span class="${typeColor} font-bold flex items-center">
                            <i data-lucide="${iconType}" class="w-4 h-4 mr-1"></i>
                            ${item.type}
                        </span>
                    </div>
                    <div class="w-full h-32 mb-2 bg-gray-100 rounded-md overflow-hidden">
                        <img src="${imageUrl}" alt="${item.item_name}" class="w-full h-full object-cover">
                    </div>
                    <p class="text-gray-600 text-sm mb-2">${item.description.substring(0, 100)}${item.description.length > 100 ? '...' : ''}</p>
                    <div class="text-xs text-gray-500 space-y-1">
                        <p><i data-lucide="map-pin" class="w-3 h-3 inline-block mr-1"></i> Location: ${item.location_lost_found}</p>
                        <p><i data-lucide="calendar" class="w-3 h-3 inline-block mr-1"></i> Date: ${item.date_lost_found}</p>
                        <p><i data-lucide="tag" class="w-3 h-3 inline-block mr-1"></i> Category: ${item.category}</p>
                        <p><i data-lucide="user" class="w-3 h-3 inline-block mr-1"></i> Posted by: ${item.full_name}</p>
                    </div>
                    <div class="mt-3 flex justify-end space-x-2">
                        <button class="text-sm text-blue-600 hover:text-blue-800 font-medium" onclick="app.showDetails(${item.item_id})">View Details</button>
                        ${isOwner 
                            ? `<button class="text-sm text-red-600 hover:text-red-800 font-medium" onclick="app.deleteItem(${item.item_id})">Delete</button>` 
                            : `<button class="text-sm text-green-600 hover:text-green-800 font-medium" onclick="app.showChatView(${item.item_id}, ${item.user_id}, '${item.full_name.replace(/'/g, "\\'")}', '${item.item_name.replace(/'/g, "\\'")}')">Message Poster</button>`}
                    </div>
                </div>
            `;
            container.innerHTML += itemHtml;
        });

        lucide.createIcons();
    },

    handlePostItem: async function(e) {
        e.preventDefault();
        if (!this.state.user) return this.showMessage("Please sign in to post an item.");

        const form = e.target;
        const formData = new FormData(form);
        
        formData.append('action', 'post_item');
        formData.append('user_id', this.state.user.user_id);
        
        const response = await this.callApiForFormData(formData);
        
        if (response.status === 'success') {
            this.showMessage(response.message);
            form.reset();
            this.showDashboard('all');
        } else {
            this.showMessage(response.message);
        }
    },
    

    showDetails: async function(itemId, skipEditModeToggle = false) { 
        if (!this.state.user) return this.showView('signin');

        this.showView('item-details');
        
        if (!skipEditModeToggle) { 
            this.toggleEditMode(false); 
        }

        const data = {
            action: 'get_item_details',
            item_id: itemId
        };

        const response = await this.callApi(data);

        if (response.status === 'success' && response.item) {
            const item = response.item;
            this.state.currentItem = item; 

            document.getElementById('edit-item-id').value = item.item_id;
            document.getElementById('edit-type').value = item.type;
            document.getElementById('edit-item-name').value = item.item_name;
            document.getElementById('edit-description').value = item.description;
            document.getElementById('edit-location').value = item.location_lost_found;
            document.getElementById('edit-date').value = item.date_lost_found;
            document.getElementById('edit-category').value = item.category;
            document.getElementById('details-posted-by').textContent = item.full_name;
            
            const detailsImageContainer = document.getElementById('details-image-container');
            const imageUrl = item.image_url && item.image_url.startsWith('http')
                               ? item.image_url
                               : 'images/placeholder.png';

            detailsImageContainer.innerHTML = `<img src="${imageUrl}" alt="${item.item_name}" class="w-full h-48 object-cover rounded-xl shadow-md mb-4">`;
            
            document.getElementById('details-title').innerText = item.item_name;


            const statusElement = document.getElementById('item-status-display');
           
            const editButton = document.getElementById('edit-mode-btn');
            const claimButton = document.getElementById('claim-item-btn');

            const isOwner = item.user_id == this.state.user.user_id;
            const isClaimed = item.is_claimed === '1';

            if (statusElement) { 
                if (isClaimed) {
                    // CLAIMED Status Badge
                    statusElement.innerHTML = '<span class="px-3 py-1 bg-gray-600 text-white rounded-full font-bold">CLAIMED / RECOVERED</span>'
                } else {
                    // Original Lost/Found Status Badge 
                const statusText = item.status === 'Lost' ? 'Lost' : 'Found';
                const bgColor = item.status === 'Lost' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600';
                statusElement.innerHTML = `<span class="px-3 py-1 ${bgColor} rounded-full">${statusText}</span>`;
    }
}

            if (isOwner) {
                editButton.classList.remove('hidden');
                
                if (!isClaimed) {
                    claimButton.classList.remove('hidden');
                    claimButton.onclick = () => this.claimItem(item.item_id); 
                    claimButton.disabled = false;
                    claimButton.innerText = 'Mark as Claimed';
                } else {
                    claimButton.classList.add('hidden'); 
                }
            } else {
                editButton.classList.add('hidden');
                claimButton.classList.add('hidden'); 
            }
            // END OF BUTTON LOGIC

        } else {
            this.showMessage(response.message || "Item not found.");
            this.showDashboard('all');
        }
    },

    toggleEditMode: function(isEditing) {
        const fields = [
            'edit-type', 'edit-item-name', 'edit-description',
            'edit-location', 'edit-date', 'edit-category'
        ];

        fields.forEach(id => {
            const element = document.getElementById(id);
            if(element) element.disabled = !isEditing;
        });

        const editBtn = document.getElementById('edit-mode-btn');
        const saveBtn = document.getElementById('save-edit-btn');
        const cancelBtn = document.getElementById('cancel-edit-btn');
        const claimBtn = document.getElementById('claim-item-btn'); 
        
        if (isEditing) {
            editBtn.classList.add('hidden');
            claimBtn.classList.add('hidden'); 
            saveBtn.classList.remove('hidden');
            cancelBtn.classList.remove('hidden');
            document.getElementById('details-title').innerText = "Edit Item";
        } else {
            if (this.state.currentItem && this.state.currentItem.user_id == this.state.user.user_id) {
                editBtn.classList.remove('hidden');
                
                
                if (this.state.currentItem.is_claimed !== '1') {
                    claimBtn.classList.remove('hidden');
                }
            } else {
                editBtn.classList.add('hidden');
                claimBtn.classList.add('hidden'); 
            }
            saveBtn.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            
            if (this.state.currentItem) {
                document.getElementById('details-title').innerText = this.state.currentItem.item_name;
            } else {
                document.getElementById('details-title').innerText = "Item Details";
            }
            
        
        }
    },

    handleItemUpdate: async function(e) {
        e.preventDefault();
        if (!this.state.user) return this.showMessage("Please sign in to update an item.");
        if (this.state.currentItem.user_id != this.state.user.user_id) return this.showMessage("You are not authorized to update this item.");

        const form = e.target;
        const formData = new FormData(form);
        
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }

        data.action = 'update_item';
        data.user_id = this.state.user.user_id;
        data.location_lost_found = data.location;
        data.date_lost_found = data.date;
        delete data.location;
        delete data.date;

        const response = await this.callApi(data);
        
        if (response.status === 'success') {
            this.showMessage("Item updated successfully!");
            this.state.currentItem = { ...this.state.currentItem, ...data }; 
            this.showDetails(data.item_id, true); 
            this.toggleEditMode(false);
        } else {
            this.showMessage(response.message);
        }
    },
    
    claimItem: async function(itemId) {
        if (!this.state.user) return this.showMessage('Please sign in to mark an item as claimed.');

        const confirmClaim = confirm("Are you sure you want to mark this item as CLAIMED? This action is usually irreversible.");
        
        if (!confirmClaim) return;
        
        const claimBtn = document.getElementById('claim-item-btn');
        claimBtn.disabled = true;
        claimBtn.innerText = 'Processing...';

        const data = {
            action: 'claim_item', 
            item_id: itemId,
            user_id: this.state.user.user_id 
        };
        
        const result = await this.callApi(data);

        if (result.status === 'success') {
            this.showMessage('Item successfully marked as CLAIMED!');
            // Update the state and refresh the view
            if (this.state.currentItem && this.state.currentItem.item_id == itemId) {
                this.state.currentItem.is_claimed = '1';
                this.state.currentItem.status = 'Claimed';
            }
            const itemIndex = this.state.items.findIndex(item => item.item_id == itemId);
            if(itemIndex > -1) {
                this.state.items[itemIndex].is_claimed = '1';
                this.state.items[itemIndex].status = 'Claimed';
            }
            this.showDetails(itemId); 
            this.fetchItems('all'); 
        } else {
            this.showMessage(result.message || 'Failed to mark item as claimed.');
            claimBtn.disabled = false;
            claimBtn.innerText = 'Mark as Claimed';
        }
    },

    
    // Simple Search Function 
    handleSearch: function(e) {
        const query = e.target.value.trim();
        const container = document.getElementById('search-results-container');
        
        if (query.length > 2) {
            this.fetchItems('all', query, 'search-results-container');
        } else if (query.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 mt-10">Type to search for lost or found items.</p>';
        }
    },

    // Delete Item Function 
    deleteItem: async function(itemId) {
        if (!confirm("Are you sure you want to delete this item?")) return;
        
        const data = {
            action: 'delete_item',
            item_id: itemId,
            user_id: this.state.user.user_id
        };

        const response = await this.callApi(data);
        if (response.status === 'success') {
            this.showMessage(response.message);
            this.fetchItems('all');
        } else {
            this.showMessage(response.message);
        }
    },
    
    
    // --- NOTIFICATION LOGIC START ---
    
    createNotificationElement: function(notif) {
        const icon = notif.type === 'message' ? 'message-square' : (notif.type === 'claim' ? 'check-circle' : 'info'); 
        const color = notif.type === 'message' ? 'blue' : (notif.type === 'claim' ? 'green' : 'gray');
        const borderStyle = notif.is_read ? 'border-gray-200 bg-white' : `border-${color}-500 bg-${color}-50`;
        
        let action = '';
        if (notif.type === 'message' && notif.item_id && notif.sender_id) {
            // New message notification should open the specific chat
            action = `onclick="app.showChatView(${notif.item_id}, ${notif.sender_id}, 'User', 'Item')"`; 
        } else if (notif.item_id) {
            // General notification opens item details
            action = `onclick="app.showDetails(${notif.item_id})"`;
        }

        return `
            <div class="p-4 rounded-xl shadow-sm border-l-4 ${borderStyle} flex items-start cursor-pointer hover:shadow-md transition duration-150 mb-3" ${action}>
                <i data-lucide="${icon}" class="w-5 h-5 mt-1 mr-3 text-${color}-600"></i>
                <div class="flex-grow">
                    <p class="text-sm font-semibold text-gray-800">${notif.title}</p>
                    <p class="text-xs text-gray-600">${notif.body}</p>
                    <span class="text-xs text-gray-400 block mt-1">${notif.created_at || 'Just now'}</span>
                </div>
                ${!notif.is_read ? '<span class="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 mt-2"></span>' : ''}
            </div>
        `;
    },

    updateNotificationBadge: function(count) {
        const badge = document.getElementById('notification-badge');
        if (badge) {
            if (count > 0) {
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    },
    
    loadNotifications: async function() {
        if (!this.state.user) return this.showView('signin');
        
        const listContainer = document.getElementById('notifications-list');
        listContainer.innerHTML = `
            <div class="text-center text-gray-500 pt-10">
                <i data-lucide="loader-2" class="w-8 h-8 mx-auto animate-spin mb-2"></i>
                <p>Loading notifications...</p>
            </div>
        `;
        lucide.createIcons();

        try {
            const data = {
                action: 'get_user_notifications', // PHP API action
                user_id: this.state.user.user_id
            };
            
            const response = await this.callApi(data);
            listContainer.innerHTML = ''; 
            
            if (response.status === 'success' && response.notifications.length > 0) {
                const unreadCount = response.notifications.filter(n => !n.is_read).length;
                this.updateNotificationBadge(unreadCount);

                response.notifications.forEach(notif => {
                    const html = this.createNotificationElement(notif);
                    listContainer.insertAdjacentHTML('beforeend', html);
                });
                
                if (unreadCount > 0) {
                    this.markNotificationsAsRead(this.state.user.user_id);
                }

            } else {
                this.updateNotificationBadge(0);
                listContainer.innerHTML = `
                    <div id="no-notifications-message" class="text-center text-gray-500 mt-10 p-4">
                        <i data-lucide="bell-off" class="w-8 h-8 mx-auto mb-2"></i>
                        <p>You have no new notifications.</p>
                    </div>
                `;
            }
            lucide.createIcons();
            
        } catch (error) {
            console.error("Error loading notifications:", error);
            listContainer.innerHTML = '<p class="text-center text-red-500 pt-10">Failed to load notifications.</p>';
        }
    },

    markNotificationsAsRead: function(userId) {
        const data = {
            action: 'mark_notifications_read',
            user_id: userId
        };
        fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        }).then(() => {
            this.updateNotificationBadge(0);
        }).catch(error => {
            console.error("Background error marking notifications as read:", error);
        });
    },

    checkForUnreadNotifications: async function() {
        if (!this.state.user) return;
        
        try {
            const data = {
                action: 'get_unread_count', 
                user_id: this.state.user.user_id
            };
            
            const response = await this.callApi(data);
            if (response.status === 'success' && response.unread_count > 0) {
                this.updateNotificationBadge(response.unread_count);
            } else {
                this.updateNotificationBadge(0);
            }
        } catch (error) {
            console.error("Error checking unread notifications:", error);
        }
    },
    
    // --- NOTIFICATION LOGIC END ---

    // --- CHAT LOGIC START: Conversation List ---

    
    showChatList: function() {
        if (!this.state.user) return this.showView('signin');
        this.showView('chat-list');
    },

    fetchConversations: async function() {
        const userId = this.state.user.user_id;
        const container = document.getElementById('chat-list-container');
        
        container.innerHTML = `
            <div class="text-center text-gray-500 pt-10">
                <i data-lucide="loader-2" class="w-8 h-8 mx-auto animate-spin mb-2"></i>
                <p>Loading your conversations...</p>
            </div>
        `;
        lucide.createIcons();

        const data = {
            action: 'get_user_conversations', 
            user_id: userId
        };

        const response = await this.callApi(data);
        
        if (response.status === 'success') {
            this.renderConversations(response.conversations, container);
        } else {
            container.innerHTML = `<p class="text-center text-gray-500 pt-10">You have no active conversations yet. Find an item to message a poster!</p>`;
            if (response.message && !response.message.includes('conversations')) {
                this.showMessage(response.message);
            }
        }
    },
    
    renderConversations: function(conversations, container) {
        container.innerHTML = '';
        if (conversations.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 pt-10">You have no active conversations yet. Find an item to message a poster!</p>`;
            return;
        }

        conversations.forEach(chat => {
            const receiverIdToOpen = chat.other_user_id; 
            const unreadBadge = chat.unread_count > 0 
                ? `<span class="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">${chat.unread_count}</span>` 
                : '';
            
            const chatHtml = `
                <div class="bg-white p-4 rounded-xl shadow-md border-l-4 border-blue-500 mb-3 cursor-pointer hover:bg-gray-50" 
                    onclick="app.showChatView(${chat.item_id}, ${receiverIdToOpen}, '${chat.other_user_name.replace(/'/g, "\\'")}', '${chat.item_name.replace(/'/g, "\\'")}')">
                    
                    <div class="flex justify-between items-center">
                        <h4 class="text-md font-semibold text-gray-800">
                            <i data-lucide="message-square" class="w-4 h-4 inline-block mr-1 text-blue-500"></i>
                            Chat with: **${chat.other_user_name}**
                        </h4>
                        ${unreadBadge}
                    </div>
                    <p class="text-sm text-gray-600 mt-1 truncate">Item: ${chat.item_name}</p>
                    <p class="text-xs text-gray-500 mt-1">${chat.last_message_text ? chat.last_message_text.substring(0, 50) + (chat.last_message_text.length > 50 ? '...' : '') : 'Start the conversation!'}</p>
                    <span class="text-xs text-gray-400 block mt-1 text-right">${chat.last_message_time}</span>
                </div>
            `;
            container.innerHTML += chatHtml;
        });
        lucide.createIcons();
    },


    showChatView: async function(itemId, receiverId, receiverName, itemName) {
        if (!this.state.user) return this.showView('signin');
        
        if (receiverId == this.state.user.user_id) {
            return this.showMessage("You cannot send a message to yourself. Please check the item details for contact info if applicable.");
        }
        
        this.state.currentChatItemId = itemId;
        this.state.currentChatReceiverId = receiverId;
        
        document.getElementById('chat-header-name').textContent = `Chat with ${receiverName} (Item: ${itemName.substring(0, 15)}...)`;
        
        this.showView('chat-view');
        await this.fetchMessages();
        
        // Clear previous interval if any
        if (this.state.chatRefreshInterval) {
            clearInterval(this.state.chatRefreshInterval);
        }
        
        
        this.state.chatRefreshInterval = setInterval(() => {
            
            this.fetchMessages(true); 
        }, 3000); 

        console.log(`Chat refresh started for Item ID: ${itemId} (Interval ID: ${this.state.chatRefreshInterval})`);
    },
    
    fetchMessages: async function(isSilent = false) { 
        const itemId = this.state.currentChatItemId;
        const receiverId = this.state.currentChatReceiverId;
        const userId = this.state.user.user_id;
        
        const chatContainer = document.getElementById('chat-history'); 

        if (!userId || !itemId || !receiverId) {
            chatContainer.innerHTML = `<p class="text-center text-red-500 pt-10">ERROR: Missing chat session details. Please go back and re-open the chat.</p>`;
            return;
        }
        
        if (!isSilent) {
            chatContainer.innerHTML = `
                <div class="text-center text-gray-500 pt-10">
                    <i data-lucide="loader-2" class="w-8 h-8 mx-auto animate-spin mb-2"></i>
                    <p>Loading conversation...</p>
                </div>
                `;
            lucide.createIcons();
        }

        const data = {
            action: 'fetch_messages',
            item_id: itemId,
            user_id: userId,
            receiver_id: receiverId
        };

        const response = await this.callApi(data);
        
        if (response.status === 'success') {
            this.renderMessages(response.messages, chatContainer);
            this.markMessagesAsRead(); // Mark as read after rendering
        } else {
            
            if (!isSilent) {
                chatContainer.innerHTML = `<p class="text-center text-gray-500 pt-10">Start a conversation!</p>`;
            }
        }
    },
    

    renderMessages: function(messages, container) {
        container.innerHTML = '';
        const currentUserId = this.state.user.user_id;

        if (messages.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 pt-10">Start a conversation!</p>`;
            return;
        }

        messages.forEach(msg => {
            const isSender = msg.sender_id == currentUserId;
            
            let displayTime = '...';
            try {
                
                displayTime = new Date(msg.sent_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            } catch (e) {
                console.error("Error parsing message time:", e);
            }
            
            
            const senderClasses = 'bg-blue-600 text-white rounded-xl rounded-br-sm'; 
            const receiverClasses = 'bg-gray-200 text-gray-800 rounded-xl rounded-bl-sm'; 
            
            const bubbleClasses = isSender ? senderClasses : receiverClasses;
            const timeColor = isSender ? 'text-gray-300' : 'text-gray-500'; 
            const messageHtml = `
                <div class="flex ${isSender ? 'justify-end' : 'justify-start'} w-full mb-3">
                    <div class="max-w-[75%] flex flex-col ${isSender ? 'items-end' : 'items-start'}">
                        <div class="p-3 shadow-md ${bubbleClasses}">
                            <p class="text-sm whitespace-pre-wrap">${msg.message_text}</p>
                        </div>
                        <span class="text-xs ${timeColor} block mt-1">${displayTime}</span>
                    </div>
                </div>
            `;
            container.innerHTML += messageHtml;
        });
        
    
        container.scrollTop = container.scrollHeight;
    },
    
    handleSendMessage: async function() {
        const input = document.getElementById('chat-message-input');
        const messageText = input.value.trim();
        
        if (!messageText || !this.state.user || !this.state.currentChatItemId || !this.state.currentChatReceiverId) {
            return;
        }
        
        const senderId = this.state.user.user_id;
        const receiverId = this.state.currentChatReceiverId;
        const itemId = this.state.currentChatItemId;
        
        
        const chatContainer = document.getElementById('chat-history');
        const tempMsgId = Date.now();
        
        
        const tempMessageHtml = `
            <div id="temp-msg-${tempMsgId}" class="flex justify-end w-full mb-3">
                <div class="max-w-[75%] flex flex-col items-end">
                    <div class="p-3 shadow-md bg-blue-600 text-white rounded-xl rounded-br-sm opacity-90">
                        <p class="text-sm whitespace-pre-wrap">${messageText}</p>
                        </div>
                    <span class="text-xs text-gray-300 block mt-1">Sending...</span>
                </div>
            </div>
        `;
        
        if (chatContainer.querySelector('p.text-center')) {
             chatContainer.innerHTML = '';
        }
        chatContainer.innerHTML += tempMessageHtml;
        chatContainer.scrollTop = chatContainer.scrollHeight;
        input.value = '';
        input.focus();
        
        
        const data = {
            action: 'send_message',
            sender_id: senderId,
            receiver_id: receiverId,
            item_id: itemId,
            message_text: messageText
        };
        
        const response = await this.callApi(data);
        
        
        const tempMessageElement = document.getElementById(`temp-msg-${tempMsgId}`);
        if (response.status === 'success') {
            this.fetchMessages(true); 
        } else {
            if (tempMessageElement) {
                tempMessageElement.remove();
            }
            this.showMessage(response.message || "Failed to send message.");
        }
    },
    
    markMessagesAsRead: function() {
        if (!this.state.user || !this.state.currentChatItemId || !this.state.currentChatReceiverId) {
            return;
        }
        
        // Fire-and-forget: we don't need to await this response
        const data = {
            action: 'mark_messages_read', 
            item_id: this.state.currentChatItemId,
            user_id: this.state.user.user_id, // The user who is reading
            other_user_id: this.state.currentChatReceiverId // The user who sent them
        };
        
        // Use the basic fetch method since we don't need the return data
        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(() => {
            // Optional: Update notification badge immediately after reading
            this.checkForUnreadNotifications();
        }).catch(error => {
            console.warn("Background error marking messages as read:", error);
        });
    },

    
    // --- API Helper functions ---
    
    callApi: async function(data) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const contentType = response.headers.get("content-type");
            const isJson = contentType && contentType.includes("application/json");

            if (!response.ok) {
                
                if (isJson) {
                    const errorJson = await response.json();
                    console.error("API Error JSON:", response.status, errorJson);
                    return errorJson; 
                } else {
                    const text = await response.text();
                    console.error("Server responded with generic error:", response.status, text);
                    return { status: 'error', message: `Server error (${response.status}). Check console for details.` };
                }
            }
            
            if (isJson) {
                return await response.json();
            } else {
                const text = await response.text();
                console.error("API response was not valid JSON:", text);
                return { status: 'error', message: 'Invalid response from server. Check server logs.' };
            }

        } catch (error) {
            console.error('API Call Error:', error);
            return { status: 'error', message: 'Failed to communicate with the server. (Check API URL)' };
        }
    },

    callApiForFormData: async function(formData) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                
                body: formData
            });
            
            const contentType = response.headers.get("content-type");
            const isJson = contentType && contentType.includes("application/json");

            if (!response.ok) {
                if (isJson) {
                    const errorJson = await response.json();
                    console.error("API Error JSON:", response.status, errorJson);
                    return errorJson; 
                } else {
                    const text = await response.text();
                    console.error("Server responded with generic error:", response.status, text);
                    return { status: 'error', message: `Server error (${response.status}). Check console for details.` };
                }
            }
            
            if (isJson) {
                return await response.json();
            } else {
                    const text = await response.text();
                    console.error("API response was not valid JSON:", text);
                    return { status: 'error', message: 'Invalid response from server. Check server logs.' };
            }

        } catch (error) {
            console.error('FormData API Call Error:', error);
            return { status: 'error', message: 'Failed to communicate with the server. (Check API URL)' };
        }
    }
};

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    app.init();
    lucide.createIcons();
});