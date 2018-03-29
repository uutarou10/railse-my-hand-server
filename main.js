const app = require('express')()
const server = require('http').Server(app)
const io = require('socket.io')(server)
const uuid = require('uuid/v1');

/* Server port */
const PORT = process.env.PORT || 3000
/* Admin password */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'this_is_my_secret'

/* Connected users */
let users = []
/* Queue */
let jobQueue = []

server.listen(PORT)

io.on('connection', (socket) => {
  console.log('New connection established.')
  let currentUser = null 
  let isOpen = false;

  /* initialize */
  socket.emit('currentJobQueue', jobQueue)
  socket.emit('currentStatus', isOpen)

  /* for debugging */
  socket.on('debug', (payload) => {
    console.log(payload)
  })

  /* user joined event */
  socket.on('join', (name) => {
    currentUser = createUser(name)
    users.push(currentUser)
    socket.emit('completedJoin', currentUser)
    emitUpdatedUserCount();
  })

  /* admin user joined event */
  socket.on('joinAdmin', (password) => {
    if (password === ADMIN_PASSWORD) {
      currentUser = createAdminUser()
      socket.emit('completedJoin', currentUser)
    } else {
      socket.emit('faildJoin', 'Incorrect password. Please try agein.')
    }
  })

  /* task confirmation event */
  socket.on('taskConfirmation', () => {
    if (currentUser.isAdmin || isAlreadyEnqueued(currentUser)) return

    jobQueue.push(createJob(currentUser, 'taskConfirmation'))
    emitUpdatedJobQueue()
  })

  /* question event */
  socket.on('question', () => {
    if (currentUser.isAdmin || isAlreadyEnqueued(currentUser)) return

    jobQueue.push(createJob(currentUser, 'question'))
    emitUpdatedJobQueue()
  })

  socket.on('toggleStatus', () => {
    if (currentUser && currentUser.isAdmin) {
      isOpen = !isOpen
      emitUpdatedStatus()
    }
  })

  /* cancel enqueued job */
  socket.on('cancel', (uuid) => {
    if (!isAlreadyEnqueued(currentUser)) return
    
    switch (currentUser.isAdmin) {
      case true:
        jobQueue = jobQueue.filter((job) => {
          return job.uuid !== uuid
        })
      case false:
        jobQueue = jobQueue.filter((job) => {
          return job.user.uuid !== currentUser.uuid 
        })
    }
    emitUpdatedJobQueue()
  })

  socket.on('disconnect', () => {
    console.log('Disconnected...')

    if (currentUser && !currentUser.isAdmin) {
      users = users.filter((user) => {
        return currentUser.uuid !== user.uuid
      })

      emitUpdatedUserCount();
      
      jobQueue = jobQueue.filter((job) => {
        return currentUser.uuid !== job.user.uuid
      })

      emitUpdatedJobQueue();
    }
  })

  /* emit to all clients when update job queue. */
  const emitUpdatedJobQueue = () => {
    socket.broadcast.emit('updateJobQueue', jobQueue)
  }

  /* emit to all clients when update count of users. */
  const emitUpdatedUserCount = () => {
    console.log(users)
    const userCount = users.filter((user) => (!user.isAdmin)).length
    socket.broadcast.emit('updateUserCount', userCount)
  }

  const emitUpdatedStatus = () => {
    socket.broadcast.emit('updateStatus', isOpen)
  }
})

const createUser = (name) => ({
  uuid: uuid(),
  name: name,
  isAdmin: false 
})

const createAdminUser = () => ({
  uuid: uuid(),
  isAdmin: true
})

const createJob = (user, jobType) => {
  return {
    uuid: uuid(),
    user: user,
    type: jobType,
    timestamp: new Date().getTime()
  }
}

/* Check exist given user in queue, if exists return true. */
const isAlreadyEnqueued = (user) => {
  return jobQueue.filter((item) => {
    return item.user.uuid === user.uuid
  }).length > 0
}