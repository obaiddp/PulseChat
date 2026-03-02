// (0) database connection
require('dotenv').config()
//const { PrismaClient } = require("./generated/prisma"); // ✅ correct

const jwt = require("jsonwebtoken")

const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();

// (1) setting up express, http and socket.io server
const express = require('express');
const app = express();

const http = require('http');
const server = http.createServer(app);

const { Server } = require('socket.io');
const io = new Server(server);

app.use(express.json())  // ← add this, needed to read req.body

// (2) path for html file
const path = require('path');
app.use(express.static(path.resolve("./public")))


// (3) routes 
app.get('/', (req, res) => {
	res.sendFile(path.resolve("./public/login.html"));
})

app.use("/auth", require("./routes/auth"))

// (4) socket and other stuff handaling
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("No token"));

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        //socket.user = decoded.name;    // now socket.user comes from real DB
        socket.userId = decoded.userId;
        next();
    } catch (err) {
        next(new Error("Invalid token"));
    }
})

io.on("connection", (socket) => {

	// ======================= joining
	socket.on("user-join", async (currentUser) => {
		
		// need to save user name here, 
		const singleUser = await prisma.user.findUnique({
			where: {
				id: socket.userId
			}
		})

		socket.user = singleUser.name;


		// get all active users
		const activeUsers = await prisma.user.findMany({
			where: {
				active: true
			},
			select: {
				id: true,
				name: true
			}
		});
		console.log(activeUsers)

		// when a new user join, it broadcast to all the users
		io.emit("user-join-res", activeUsers);
	})

	// ====================== Public Room
	
	const sendPublicRooms = async () => {
		const publicRooms = await prisma.room.findMany({
			where: {
				isPrivate: false
			}
		})

		for (let pr of publicRooms){
			console.log(`Sending public rooms ${pr.name}`)
		}

		io.emit("public-rooms", publicRooms);

	}

	sendPublicRooms();


	socket.on("new-public-room", async ({ newRoom }) => {
		console.log(`Incomding +++++++++++ ${newRoom}`)

		
		console.log("------- creating room -------")

		const exists = await prisma.room.findUnique({
			where: {
				name: newRoom
			}
		})

		console.log(`exist:  ${exists}`)

		if (exists == null){
			const createRoom = await prisma.room.create({
				data: {
					name: newRoom,
					createdById: socket.userId,
				}

			})

			await prisma.userRoom.create({
				data: {
					userId: socket.userId,
					roomId: createRoom.id
				}
			})

			console.log(createRoom)
		}
		else {
			socket.emit("duplicate-room-alert")
			
		}
	})

	socket.on("public-room-join", async ({ room }) => {
		console.log("User wants to join the room: ", room);

		const findRoom = await prisma.room.findUnique({
			where: {
				name: room
			},
			include: {
				messages: true
			}
		})

		socket.roomId = findRoom.id;

		console.log(findRoom)
		console.log(findRoom.messages)

		socket.emit("public-room-join-res", { chats: findRoom.messages })
	})

	socket.on("public-room-message", async ({ room, message }) => {
		console.log(`On Public Room message getting, room: ${room}, message ${message}`)

		// store messages in database and emit them
		const dbMessage = await prisma.message.create({
			data: {
				content: message, 
				userId: socket.userId,
				roomId: socket.roomId,
				userName: socket.user
			}
		})

		console.log("My db messages ::::::::+::::::::", dbMessage)

		socket.emit("public-room-message-res", { chats: dbMessage })
	})








	
	// ======================= Private Room
	socket.on("private-room-join", async ({ roomName, targetUser }) => {
		// if room doesnot exists in db, create room
		let room = await prisma.room.findUnique({
			where: {
				name: roomName
			},
			include: {
				messages: {
					orderBy: {createdAt: "asc"}
				}
			}
		})
		
		console.log("???????????????????? Room name", roomName);

		//let room = await prisma.room.findUnique({
		//	where: {name: roomName}
		//})

		console.log("Room clready created ++++++++++++++ ", room)


		if (!room){
			room = await prisma.room.create({
				data: {
					name: roomName,
					createdById: socket.user
				}
			})

			await prisma.userRoom.createMany({
				data: [
					{roomId: room.id, userId: socket.user},
					{roomId: room.id, userId: targetUser}
				],
				skipDuplicates: true
			})
			room.messages = []
		}

		socket.roomId = room.id;

		console.log(roomName)
		console.log('=====================')
		console.log(room)

		console.log(room.messages)
		
		// join room
		socket.join(room.id);

		socket.emit("private-room-join-res", { roomMessages: room.messages || [] })

	})

	socket.on("private-room-message", async ({room, message}) => {
		console.log(`${socket.user}::::::::::::::::::${message}`)
		console.log("Getting room while messaging +_____=+++++++_______:", room)


		const dbMessage = await prisma.message.create({
			data: {
				content: message, 
				userId: socket.userId,
				roomId: socket.roomId,
				userName: socket.user
			}
		})

		console.log("My db messages ::::::::+::::::::", dbMessage)

		console.log("socket.roomId:::::::::", socket.roomId)

		socket.to(socket.roomId).emit("private-room-message-res", { message })
	})


	socket.on("user-logout", async (currentUser) => {
		const inactiveUser = await prisma.user.update({
			where: {
				id: currentUser
			},
			data: {
				active: false
			}
		})
	})

})


server.listen(3000, () => {
console.log("server listening on 3000")
})

