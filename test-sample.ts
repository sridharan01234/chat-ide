// Sample TypeScript file for testing drag-and-drop functionality
export interface User {
    id: number;
    name: string;
    email: string;
    isActive: boolean;
}

export class UserService {
    private users: User[] = [];

    constructor() {
        console.log('UserService initialized');
    }

    async createUser(userData: Omit<User, 'id'>): Promise<User> {
        const newUser: User = {
            id: Date.now(),
            ...userData
        };
        
        this.users.push(newUser);
        console.log('User created:', newUser);
        return newUser;
    }

    async getUserById(id: number): Promise<User | null> {
        const user = this.users.find(u => u.id === id);
        return user || null;
    }

    async updateUser(id: number, updates: Partial<User>): Promise<User | null> {
        const userIndex = this.users.findIndex(u => u.id === id);
        
        if (userIndex === -1) {
            return null;
        }

        this.users[userIndex] = { ...this.users[userIndex], ...updates };
        return this.users[userIndex];
    }

    async deleteUser(id: number): Promise<boolean> {
        const initialLength = this.users.length;
        this.users = this.users.filter(u => u.id !== id);
        return this.users.length < initialLength;
    }

    getAllUsers(): User[] {
        return [...this.users];
    }

    getActiveUsers(): User[] {
        return this.users.filter(user => user.isActive);
    }
}

// Example usage
const userService = new UserService();

async function example() {
    // Create a new user
    const newUser = await userService.createUser({
        name: "John Doe",
        email: "john@example.com",
        isActive: true
    });

    console.log('Created user:', newUser);

    // Get user by ID
    const foundUser = await userService.getUserById(newUser.id);
    console.log('Found user:', foundUser);

    // Update user
    const updatedUser = await userService.updateUser(newUser.id, {
        name: "John Smith"
    });
    console.log('Updated user:', updatedUser);

    // Get all active users
    const activeUsers = userService.getActiveUsers();
    console.log('Active users:', activeUsers);
}

example().catch(console.error);