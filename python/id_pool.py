import time
class IdPool:
    def __init__(self,maxNumIds,timeout) -> None:
        self.keys = [None]*maxNumIds
        self.expires = [0]*maxNumIds
        self.timeout = timeout
    def get_id(self,key):         
        try:        
            id=self.keys.index(key)
            self.expires[id]=time.time()+self.timeout
            id+=1
        except ValueError:
            id=self.get_new_id(key)
        return id

    def get_new_id(self,key):
        id=next((i for i,expiration in enumerate(self.expires) if self.has_expired(expiration)),None)
        if id==None:
            return id
        self.keys[id]=key
        self.expires[id]=time.time()+self.timeout
        return id+1

    def has_expired(self,expiration):
        return expiration<time.time()
        pass


if __name__=="__main__":
    print("Quick Tests")
    #check the ids run out on 13
    pool = IdPool(12,2)
    print([pool.get_id(i) for i in range(1,14)])
    print(pool.keys)
    time.sleep(2)
    print(pool.get_id(5))
    print([pool.get_id(i) for i in range(1,15)])
    print(pool.keys)
    
