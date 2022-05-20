const express = require('express')
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors')
require('dotenv').config()
const jwt = require('jsonwebtoken');
const app = express()
const port = process.env.PORT || 5000
app.use(cors())
app.use(express.json())
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vc8sr.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

function verifyJWT (req, res, next){
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({massage: 'UnAuthorization access'})
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
    if(err){
      return res.status(403).send({massage: 'Forbidden access'})
    }
    req.decoded = decoded;
    next();
  })
}


async function run () {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
    try {
        await client.connect();
        const serviceCollection = client.db("doctor_portal").collection("services");
        const bookingCollection = client.db("doctor_portal").collection("bookings");
        const userCollection = client.db("doctor_portal").collection("users");
        const doctorCollection = client.db("doctor_portal").collection("doctor");
        
        const verifyAdmin = async (req, res, next) => {
          const requester = req.decoded.email;
        const requesterAccount = await userCollection.findOne({email: requester});
        if(requesterAccount.role === 'admin'){
         next()
        }
        else{
          res.status(403).send({massage: 'forbidden'});
        }
        }
       
        app.get('/services', async(req, res)=>{
        const query = {};
        const cursor = serviceCollection.find(query).project({name: 1})
        const services = await cursor.toArray();
        res.send(services);
      })
      app.put('/user/admin/:email', verifyJWT, verifyAdmin, async(req, res)=> {
        const email = req.params.email;
          const filter = {email: email};
          const updateDoc = {
            $set: {role: 'admin'},
          };
          const result = await userCollection.updateOne(filter, updateDoc);
          res.send(result); 

      })
      app.get('/admin/:email', async(req, res) => {
        const email = req.params.email;
        const user = await userCollection.findOne({email: email});
        const isAdmin = user.role === 'admin';
        res.send({admin: isAdmin});
      })
      app.put('/user/:email', async(req, res)=> {
        const email = req.params.email;
        const user = req.body;
        const filter = {email: email};
        const options = {upsert: true};
        const updateDoc = {
          $set: user,
        }
        const result = await userCollection.updateOne(filter, updateDoc, options);
        const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN, {expiresIn: '1h'})
        res.send({result, token}); 
      })
      app.get('/users', verifyJWT,  async(req, res)=> {
        const users = await userCollection.find().toArray();
        res.send(users);
      })
      app.get('/available', async(req, res)=> {
        const date = req.query.date 
        // step-1: get all services 
        const services = await serviceCollection.find().toArray()
        // step-2: get the booking of that day.output: [{}, {}, {}, {}, {}, {}]
        const query = {date: date};
        const bookings = await bookingCollection.find(query).toArray();
        // step-3: for each service 
        services.forEach(service => {
          // step-4: find bookings for the service. output: [{}, {}, {}] 
          const serviceBookings = bookings.filter(book => book.treatment === service.name);
          // step-5: select slots for the service bookings: ['', '', '']
          const bookingSlots = serviceBookings.map(booking => booking.slot);
          // step-6: selete those slots that are not in bookingSlots
          const available = service.slots.filter(slot => !bookingSlots.includes(slot));
          // step-7: set available to slots to make it easier
          service.slots = available;
        })
        // const services = await serviceCollection.find().toArray()
        res.send(services);
      })
      app.get('/booking', verifyJWT, async(req, res)=>{
        const patient = req.query.patient;
        const decodedEmail = req.decoded.email;
        if(patient === decodedEmail){
          const query = {patient: patient};
          const booking = await bookingCollection.find(query).toArray();
        res.send(booking);
       }
       else{
         return res.status(403).send({message: 'forbidden access'});
       }
      })

        app.post('/booking', async(req, res)=>{
          const booking = req.body;
          const query = {treatment: booking.treatment, data: booking.data, patient: booking.patient}
          const exists = await bookingCollection.findOne(query);
          if(exists){
            return res.send({success: false, booking: exists})
          }
          const result = bookingCollection.insertOne(booking);
         return res.send({success: true,  result});
        })
        // WARNING 
        // THIS IS NOT PROPER WAY TO QUERY.
        // AFTER LEARNING MORE ABOUT MONGODB. USE AGGEGATE LOOKUP, PIPLINE, MATCH, GROUP.
        app.get('/doctor', verifyJWT, verifyAdmin, async(req, res) => {
          const doctor = await doctorCollection.find().toArray()
          res.send(doctor);
        })
        
        app.post('/doctor', verifyJWT, verifyAdmin, async(req , res) => {
          const doctor = req.body;
          const result = await doctorCollection.insertOne(doctor);
          res.send(result);
        })
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async(req , res) => {
         const email = req.params.email;
         const filter = {email: email};
          const result = await doctorCollection.deleteOne(filter);
          res.send(result);
        })
        

    }
    finally{

    }
}
run().catch(console.dir);
app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})