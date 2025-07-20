import express from "express"
// import pg from "pg"
import bodyParser from "body-parser"
import env from "dotenv"
import cors from "cors"
import bcrypt from 'bcrypt'
import postgres from "postgres"

// import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg';



// This reuses connections behind the scenes
// const result = await pool.query('SELECT * FROM tasks WHERE uid = $1', ['uid123']);


const app = express();
const port = 3000;
env.config();
const db = new Pool({
  connectionString: process.env.CONNECTION_STRING,
//   ssl: { rejectUnauthorized: false }
});
// const supabaseUrl = process.env.SUPABASE_URL
// const supabaseKey = process.env.SUPABASE_KEY
// const db = createClient(supabaseUrl, supabaseKey)

app.use(express.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(cors({
    origin: "https://task-pilot-liard.vercel.app",
    credentials: true
}));

// const db = new pg.Client({
//     host: process.env.DATABASE_HOST,
//     database: process.env.DATABASE_NAME,
//     password: process.env.DATABASE_PASSWORD,
//     port: process.env.DATABASE_PORT,
//     user: process.env.DATABASE_USER   
// });
const saltRounds = parseInt(process.env.SALT_ROUNDS,10); 

// db.connect();

app.post("/login", (req,Res)=>{
    const email = req.body.user_email;
    const password = req.body.user_password;
    const org_name = req.body.org_name; 
    db.query(`SELECT uid,email,user_name,user_position, user_password, org_name FROM user_info WHERE email=$1 AND org_name=$2`,
        [email,org_name],
        (err,res)=>{
        if(err) Res.status(500).json({successs:false});
        else {
            if(res.rows.length === 0) {
                Res.send(res.rows);
            }
            bcrypt.compare(password, res.rows[0].user_password , (error,result) => {
                if(result) {
                    Res.send(res.rows[0]);
                }
                else Res.status(401).json({success:false});
            })
        }
    });
})
//ensure email uniqueness
app.post("/register", async (req,Res)=>{
    const position = req.body.position;
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    const organisation = req.body.organisation;
    console.log(req);
    
    try {
        console.log("reached");
        const checkEmailExistence = await db.query(`SELECT email FROM user_info WHERE email=$1 AND org_name=$2`, [email, organisation]);
        console.log(checkEmailExistence.rows);
        
        if(checkEmailExistence.rows.length > 0) {
            Res.send('Email already exist');
        }else{
            console.log("reached");
            
            bcrypt.hash(password, saltRounds, async (err,result)=>{
                if(err) {
                    console.log(err);
                    
                    Res.status(500).json({success:false});
                }
                else{
                    db.query(
                    `INSERT INTO user_info(email,user_password,user_name,user_position,org_name) VALUES($1,$2,$3,$4,$5);`,
                    [email,result,username,position, organisation],
                    (err,res)=>{
                        if(err) {
                            console.log(err);
                            Res.status(500).json({success:false});
                        }
                        else Res.redirect("https://task-pilot-liard.vercel.app/login");
                    });
                }
            })
        }
    } catch (error) {
        console.log(error);
        
        Res.status(500).send({success:false});
    }
})
// request from Dashboard

app.post("/getNotes", (req,Res) =>{
    const uid = req.body.uid;
    db.query(`SELECT note_key,notes FROM my_notes WHERE uid = ${uid} ORDER BY note_key`, (err,res)=>{
        if(err) console.log("Error Occured:" + err);
        else Res.send(res.rows);
    });
});
app.post("/editNotes", (req, Res) => {
    const {uid, note_key_notes} = req.body;

    const placeholders = note_key_notes.map((e,i) => `($${i*2 + 1}::integer, $${i*2 + 2}::text)`).join(", ");
    
    const query = `UPDATE my_notes SET notes = temp.notes FROM (VALUES ${placeholders} ) 
    AS temp(note_key,notes) WHERE my_notes.note_key = temp.note_key`;

    const flatValues = note_key_notes.flatMap(({note_key,notes}) => [note_key,notes]);

    db.query(query, flatValues, (err,res)=>{
        if(err) {
            console.log(err)
        }
        else Res.status(200).json({success: true});
    })
});
app.post("/deleteNotes", (req, Res) => {
    const {uid, note_key} = req.body;
    const placeholders = note_key.map((e,i) => `($${i+1}::integer)`).join(", ");

    const query = `DELETE FROM my_notes WHERE note_key IN (${placeholders})`;

    db.query(query,note_key,(err,res)=>{
        if(err) console.log(err);
        else Res.status(200).json({success: true});
    })
});
app.post("/addNotes", (req,Res)=>{
    const {uid,notes} = req.body;
    const query = `INSERT INTO my_notes(uid,notes) VALUES ($1,$2) RETURNING note_key`;
    db.query(query,[uid,notes],(err,res)=>{
        if(err) console.log(err);
        else Res.send(res.rows);
    })
})
app.post("/reportsTo", (req,Res) => {
    const uid = req.body.uid;
    db.query('SELECT uid, email, user_name, user_position FROM user_info WHERE uid IN' +
         '(SELECT reported_by FROM reports_user WHERE uid=$1) ORDER BY uid', [uid],
         (err,res)=>{
        if(err) console.log("Error Occured: reportsTo" + err);
        else Res.send(res.rows);
    });
});
app.post("/reportersCompletedTask", (req,Res)=>{
    const uid_list = req.body.ids;
    // const uid_string = uid_list.join(",");
    db.query(`SELECT uid,task_key,tasks FROM completed_tasks WHERE uid = ANY($1::int[]) ORDER BY uid`,[uid_list], (err,res)=>{
        if(err) console.log("Error Occured:reportersCompletedTask " + err);
        else Res.send(res.rows);
    });
});
app.post("/reportersPendingTask", (req,Res)=>{
    const uid_list = req.body.ids;
    db.query("SELECT uid,task_key,tasks FROM pending_tasks WHERE uid = ANY($1::int[]) ORDER BY uid",[uid_list], (err,res)=>{
        if(err) console.log("Error Occured:reportersPendingTask " + err);
        else Res.send(res.rows);
    });
});
//////////////////////////////////////////
app.post("/coWorkers", (req,Res)=>{
    const uid = req.body.uid;
    const org_name = req.body.org_name
    db.query(`SELECT uid,user_name,email FROM user_info WHERE user_position = (SELECT user_position FROM user_info WHERE uid=$1) AND org_name=$2;`,
        [uid,org_name],
        (err,res)=>{
        if(err) console.log("Error Occured: coWorkers" + err);
        else Res.send(res.rows);
    });
});
app.post("/completedTasks", (req,Res)=>{
    const uid = req.body.uid;
    db.query(`SELECT task_key,tasks FROM completed_tasks WHERE uid = ${uid} ORDER BY uid`, (err,res)=>{
        if(err) console.log("Error Occured: completedTasks" + err);
        else Res.send(res.rows);
    });
});
app.post("/pendingTasks", (req,Res)=>{
    const uid = req.body.uid;
    db.query(`SELECT task_key,tasks FROM pending_tasks WHERE uid = ${uid} ORDER BY uid`, (err,res)=>{
        if(err) console.log("Error Occured:pendingTasks " + err);
        else Res.send(res.rows);
    });
});

app.post("/addPendingTask", (req,Res)=>{
    const {uid,tasks} = req.body;
    const query = `INSERT INTO pending_tasks(uid,tasks) VALUES ($1,$2) RETURNING task_key`;
    db.query(query,[uid,tasks],(err,res)=>{
        if(err) console.log(err);
        else Res.send(res.rows);
    })
})
app.post("/addCompletedTask", (req,Res)=>{
    const {uid,tasks} = req.body;
    const query = `INSERT INTO completed_tasks(uid,tasks) VALUES ($1,$2) RETURNING task_key`;
    db.query(query,[uid,tasks],(err,res)=>{
        if(err) console.log(err);
        else Res.send(res.rows);
    })
})
//////////////////////////////////////////////
app.post("/availableMembers", (req, Res) => {
    const position = req.body.position;
    const org_name = req.body.org_name; 
    let allowedRoles = [];
    if (position === "Manager"){
        allowedRoles = ["HR"];
    } else if(position === "HR"){
        allowedRoles = ["Senior Developer", "Junior Developer"];
    } else if(position === "Senior Developer"){
        allowedRoles = ["Junior Developer"];
    }

    const query = `SELECT uid, email, user_name, user_position FROM user_info WHERE user_position = ANY($1) 
        AND uid NOT IN (SELECT DISTINCT reported_by FROM reports_user) AND org_name=$2 ORDER BY uid`;

    db.query(query, [allowedRoles,org_name], (err, res) => {
        if (err) {
            console.error("Error Occurred: availableMembers " + err);
            Res.status(500).send({ error: "Database error" });
        } else {
            Res.send(res.rows);
        }
    });
});

app.post("/addReporter", (req,Res)=>{
    const uid = req.body.uid;
    const idArray = req.body.IDs;

    const query = `INSERT INTO reports_user(uid,reported_by) SELECT $1, unnest($2::int[])`;
    db.query(query,[uid,idArray],(err,res)=>{
        if(err) Res.status(500).json({success:false});
        else Res.status(200).json({success: true}); 
    })
})
app.post("/removeTeamMember", (req,Res) =>{
    const uid = req.body.uid;
    const query = `DELETE FROM reports_user WHERE reported_by=$1`;
    db.query(query, [uid], (err,res)=>{
        if(err) console.error(err);
    })
    const query1 = `DELETE FROM completed_tasks WHERE uid=$1`;

    db.query(query1, [uid], (err,res)=>{
        if(console.error(err));
    })
    const query2 = `DELETE FROM pending_tasks WHERE uid=$1`;

    db.query(query2, [uid], (err,res)=>{
        if(console.error(err));
        else Res.status(200).json({success:200});
    })
})
app.post("/deleteTasks", (req,Res)=>{
    const {table, uid, task_keys} = req.body;
    const placeholders = task_keys.map((e,i) => `($${i+1}::integer)`).join(", ");

    const query = `DELETE FROM ${table} WHERE task_key IN (${placeholders})`;

    db.query(query,task_keys,(err,res)=>{
        if(err) console.log(err);
        else Res.status(200).json({success: true});
    })
})

app.post("/editTasks", (req,Res) =>{
    const {table, uid, task_key_tasks} = req.body;

    const placeholders = task_key_tasks.map((e,i) => `($${i*2 + 1}::integer, $${i*2 + 2}::text)`).join(", ");
    console.log(placeholders);
    
    const query = `UPDATE ${table} SET tasks = temp.tasks FROM (VALUES ${placeholders} ) 
    AS temp(task_key,tasks) WHERE pending_tasks.task_key = temp.task_key`;

    const flatValues = task_key_tasks.flatMap(({task_key,tasks}) => [task_key,tasks]);

    db.query(query, flatValues, (err,res)=>{
        if(err) {
            console.log(err)
        }
        else Res.status(200).json({success: true});
    })

})

process.on("SIGINT", async () =>{
    try {
        await db.end();
    } catch (error) {
        console.error("DB connection closing caused error");
    } finally{
        process.exit();
    }
})

app.listen(port, () => {
    console.log(`Server running on port: ${port}`)
});
