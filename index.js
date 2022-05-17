const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.eventNames.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

//MIddleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kmhef.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});

// Veryfiy Access Token
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorize access" });
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "Forbidden access" });
        }
        req.decoded = decoded;
        next();
    });
};

async function run() {
    try {
        await client.connect();
        const serviceCollection = client
            .db("doctors-portal")
            .collection("services");

        const bookingCollection = client
            .db("doctors-portal")
            .collection("bookings");
        const userCollection = client.db("doctors-portal").collection("users");

        app.post("/booking", async (req, res) => {
            const booking = req.body;
            const query = {
                treatmentName: booking.treatmentName,
                patientEmail: booking.patientEmail,
                date: booking.date,
            };
            const exist = await bookingCollection.findOne(query);
            if (exist) {
                return res.send({
                    success: false,
                    message: "Already booked  " + booking.date,
                });
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({
                success: true,
                message:
                    "Booking Successfully  " +
                    booking.date +
                    " " +
                    booking.slot,
            });
        });

        // User create and update in database
        app.put("/user/:email", async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };

            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(
                filter,
                updateDoc,
                options
            );
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, {
                expiresIn: "1h",
            });
            res.send({ result, token });
        });

        app.get("/services", async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get("/available/", async (req, res) => {
            const date = req.query.date;
            const services = await serviceCollection.find().toArray();
            const query = { date: date };
            const booking = await bookingCollection.find(query).toArray();

            services.forEach((service) => {
                const serviceBookings = booking.filter(
                    (b) => b.treatmentName === service.name
                );

                const booked = serviceBookings.map((s) => s.slot);
                const available = service.slots.filter(
                    (s) => !booked.includes(s)
                );
                service.slots = available;
            });
            res.send(services);
        });
        // get appointment
        app.get("/myappointment", verifyToken, async (req, res) => {
            const patientEmail = req.query.email;
            const decoded = req.decoded.email;
            if (decoded === patientEmail) {
                const filter = { patientEmail: patientEmail };
                const result = await bookingCollection.find(filter).toArray();
                return res.send(result);
            } else {
                res.status(403).send({ message: "Forbidden access" });
            }
        });
    } finally {
    }
}
run().catch(console.dir);
app.get("/", (req, res) => {
    res.send("Welcome to our Doctors Protal");
});

app.listen(port, () => {
    console.log(`Running server is ${port}`);
});
