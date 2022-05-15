const express = require("express");
const app = express();
const cors = require("cors");
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

async function run() {
    try {
        await client.connect();
        const serviceCollection = client
            .db("doctors-portal")
            .collection("services");
        const bookingCollection = client
            .db("doctors-portal")
            .collection("bookings");

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