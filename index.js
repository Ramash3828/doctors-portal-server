const express = require("express");
const app = express();
const cors = require("cors");
var nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const port = process.eventNames.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();

//MIddleware
app.use(cors());
app.use(express.json());
//Send Email
var transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "kakon3311@gmail.com",
        pass: process.env.EMAIL_PASS_KEY,
    },
});

function sendBookingEmail(booking) {
    const { patientName, treatmentName, patientEmail, slot, date } = booking;
    const mailOptions = {
        from: process.env.EMAIL_SENDER,
        to: patientEmail,
        subject: `Your Appointment for ${treatmentName} is on ${date} at ${slot} is confirmed`,
        text: `Your Appointment for ${treatmentName} is on ${date} at ${slot} is confirmed`,
        html: `
        <div>
        <p>Hello ${patientName}</p>
        <h3>Your Appointment for <span className="text-primary">${treatmentName}</span> is Confirmed!</h3>
        <p>Looking froward to seeing you on on <span>${date}</span> at <span>${slot}</span> </p>

        <h3 className="font-bold">Our Address:</h3>
        <p>420/042, KK ROAD</p>
        <p>Dhaka, Bangladesh.</p>
        </div>
        `,
    };
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log("Email sent: " + info.response);
        }
    });
}
// end send email

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
        const doctorCollection = client
            .db("doctors-portal")
            .collection("doctors");

        // Admin verify
        const verifyAdmin = async (req, res, next) => {
            const requseter = req.decoded.email;
            const requesterAccount = await userCollection.findOne({
                email: requseter,
            });
            if (requesterAccount.role === "admin") {
                next();
            } else {
                res.status(403).send({ message: "Forbidden access" });
            }
        };

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

            sendBookingEmail(booking);
            res.send({
                success: true,
                message:
                    "Booking Successfully  " +
                    booking.date +
                    " " +
                    booking.slot,
            });
        });

        // Admin create and update in database
        app.put(
            "/user/admin/:email",
            verifyToken,
            verifyAdmin,
            async (req, res) => {
                const email = req.params.email;
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: "admin" },
                };
                const result = await userCollection.updateOne(
                    filter,
                    updateDoc
                );
                res.send(result);
            }
        );
        // Check Admin
        app.get("/admin/:email", async (req, res) => {
            const email = req.params.email;
            const result = await userCollection.findOne({ email: email });
            const isAdmin = result?.role === "admin";
            res.send({ admin: isAdmin });
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
            const cursor = serviceCollection.find(query).project({ name: 1 });
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

        // All users
        app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find({}).toArray();
            res.send(result);
        });
        // Manage Doctors
        app.get(
            "/manage-docrtors",
            verifyToken,
            verifyAdmin,
            async (req, res) => {
                const doctors = await doctorCollection.find().toArray({});
                res.send(doctors);
            }
        );

        // Doctors create
        app.post("/doctor", verifyToken, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
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
